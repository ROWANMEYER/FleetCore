export const calculateLoadAmount = (quantity: number, rate: number, rateType: string) => {
  if (rateType === "flat" || rateType === "full") {
    return rate;
  }
  return quantity * rate;
};
