import { NextResponse } from "next/server";
import {
  estimateMonthlyRevenue,
  estimateVolumeImpact,
  FEE_ALLOCATION,
  computeFeeAllocation,
  ADX_ACCRUAL_MECHANISMS,
} from "@/lib/competition/revenue";

export async function GET() {
  const revenueProjection = estimateMonthlyRevenue();
  const volumeImpact = estimateVolumeImpact();

  // Example cohort fee breakdown for the default $25 entry with 128 participants
  const exampleCohortBreakdown = computeFeeAllocation(25, 128);

  return NextResponse.json({
    feeAllocation: FEE_ALLOCATION,
    exampleCohortBreakdown,
    monthlyRevenue: revenueProjection,
    volumeImpact,
    adxAccrualMechanisms: ADX_ACCRUAL_MECHANISMS,
  });
}
