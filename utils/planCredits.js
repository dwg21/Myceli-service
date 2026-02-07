// utils/planCredits.js
// Credit scale: 1000 credits == $1 of model spend.
export const PLAN_CREDITS = {
  free: 500,
  basic: 3000,
  pro: 6000,
};

export const getPlanCredits = (plan) => {
  if (!plan) return PLAN_CREDITS.free;
  return PLAN_CREDITS[plan] ?? PLAN_CREDITS.free;
};

export const getNextPeriodEnd = (start = new Date()) => {
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return end;
};
