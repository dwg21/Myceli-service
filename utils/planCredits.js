// utils/planCredits.js
export const PLAN_CREDITS = {
  free: 50,
  basic: 400,
  pro: 1200,
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
