import Stripe from "stripe";
import { env } from "../config/env.js";
import User from "../models/User.js";
import { getPlanCredits, getNextPeriodEnd } from "../utils/planCredits.js";

// Use Stripe's default API version for the account; override only if you have a
// confirmed, supported version string.
const stripe = new Stripe(env.stripeSecretKey);

const PLAN_TO_PRICE = {
  basic: env.stripePriceBasicMonthly,
  pro: env.stripePriceProMonthly,
};

const PRICE_TO_PLAN = Object.entries(PLAN_TO_PRICE).reduce(
  (acc, [plan, price]) => {
    if (price) acc[price] = plan;
    return acc;
  },
  {}
);

const ACTIVE_SUB_STATUSES = new Set(["active", "trialing", "past_due"]);
const frontendBase = env.frontendUrl || "http://localhost:3000";

const getPriceIdForPlan = (plan) => PLAN_TO_PRICE[plan];
const getPlanForPrice = (priceId) => PRICE_TO_PLAN[priceId];

const ensureStripeCustomer = async (user) => {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { userId: user.id },
  });
  user.stripeCustomerId = customer.id;
  await user.save({ validateModifiedOnly: true });
  return customer.id;
};

const syncSubscriptionToUser = async (subscription, hintedUserId) => {
  if (!subscription) return;
  const customerId = subscription.customer;
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = getPlanForPrice(priceId);
  const periodStartTs = subscription.current_period_start;
  const periodEndTs = subscription.current_period_end;

  const user =
    (hintedUserId && (await User.findById(hintedUserId))) ||
    (customerId && (await User.findOne({ stripeCustomerId: customerId })));

  if (!user) {
    console.warn(
      "[billing] No user matched subscription",
      subscription.id,
      "customer",
      customerId
    );
    return;
  }

  user.stripeCustomerId = customerId;
  user.stripeSubscriptionId = subscription.id;

  if (plan && ACTIVE_SUB_STATUSES.has(subscription.status)) {
    user.plan = plan;
    user.creditsTotal = getPlanCredits(plan);
    user.creditsUsed = 0;
    if (Number.isFinite(periodStartTs)) {
      user.periodStart = new Date(periodStartTs * 1000);
    }
    if (Number.isFinite(periodEndTs)) {
      user.periodEnd = new Date(periodEndTs * 1000);
    }
  } else if (
    ["canceled", "unpaid", "incomplete_expired"].includes(subscription.status)
  ) {
    const now = new Date();
    user.plan = "free";
    user.creditsTotal = getPlanCredits("free");
    user.creditsUsed = 0;
    user.periodStart = now;
    user.periodEnd = getNextPeriodEnd(now);
  } else if (ACTIVE_SUB_STATUSES.has(subscription.status) && !plan) {
    console.warn(
      "[billing] Active subscription has unrecognized price",
      priceId
    );
  }

  await user.save();
};

export const createCheckoutSession = async (req, res) => {
  try {
    const { plan, successUrl, cancelUrl, metadata } = req.body;
    if (!plan || plan === "free") {
      return res.status(400).json({ error: "A paid plan is required" });
    }
    const priceId = getPriceIdForPlan(plan);
    if (!priceId) {
      return res.status(400).json({ error: "Unsupported plan" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const customerId = await ensureStripeCustomer(user);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url:
        successUrl ||
        `${frontendBase.replace(/\/$/, "")}/workspace/settings?billing=success`,
      cancel_url:
        cancelUrl ||
        `${frontendBase.replace(/\/$/, "")}/workspace/settings?billing=cancelled`,
      metadata: {
        userId: user.id,
        plan,
        ...(metadata || {}),
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          plan,
        },
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("[billing] create checkout session error:", err);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
};

export const createPortalSession = async (req, res) => {
  try {
    const { returnUrl } = req.body || {};
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.stripeCustomerId) {
      return res.status(400).json({
        error: "No billing account found. Start a subscription first.",
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url:
        returnUrl ||
        `${frontendBase.replace(/\/$/, "")}/workspace/settings`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("[billing] create portal session error:", err);
    res.status(500).json({ error: "Failed to open billing portal" });
  }
};

export const handleStripeWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (!signature) return res.status(400).send("Missing stripe-signature");

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      env.stripeWebhookSecret
    );
  } catch (err) {
    console.error("[billing] webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription,
            { expand: ["items.data.price"] }
          );
          await syncSubscriptionToUser(
            subscription,
            session.metadata?.userId || subscription.metadata?.userId
          );
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await syncSubscriptionToUser(
          subscription,
          subscription.metadata?.userId
        );
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[billing] webhook handler error:", err);
    return res.status(500).send("Webhook handler error");
  }

  res.json({ received: true });
};
