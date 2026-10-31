export type FundInsightStance =
  | 'consider_add'
  | 'hold_or_monitor'
  | 'review_reduce_or_switch'
  | 'insufficient_data'

export interface PortfolioInsightFundInput {
  name: string
  investedAmount: number
  currentValue: number
  absoluteReturnPercent: number | null
  annualizedXirr: number | null
  weightedAverageAgeDays: number
  portfolioSharePercent: number
}

export interface FundInsight {
  fundName: string
  stance: FundInsightStance
  rationale: string
  supportingSignals: string[]
  risks: string[]
}

export interface PortfolioInsights {
  generatedAt: string
  reviewSummary: string
  funds: FundInsight[]
  portfolioNotes: string[]
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isPortfolioInsights(
  value: unknown,
): value is PortfolioInsights {
  if (!isRecord(value)) {
    return false
  }

  if (
    typeof value.generatedAt !== 'string' ||
    typeof value.reviewSummary !== 'string' ||
    !isStringArray(value.portfolioNotes) ||
    !Array.isArray(value.funds)
  ) {
    return false
  }

  return (
    value.funds.every((fund: unknown) => {
      if (!isRecord(fund)) {
        return false
      }

      return (
        typeof fund.fundName === 'string' &&
        (fund.stance === 'consider_add' ||
          fund.stance === 'hold_or_monitor' ||
          fund.stance === 'review_reduce_or_switch' ||
          fund.stance === 'insufficient_data') &&
        typeof fund.rationale === 'string' &&
        isStringArray(fund.supportingSignals) &&
        isStringArray(fund.risks)
      )
    })
  )
}

export async function requestPortfolioInsights(
  funds: PortfolioInsightFundInput[],
): Promise<PortfolioInsights> {
  const response = await fetch('/api/portfolio-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ funds }),
  })

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : 'The Ollama model could not analyze the portfolio.'
    throw new Error(message)
  }

  if (!isPortfolioInsights(payload)) {
    throw new Error('The Ollama model returned an unexpected analysis response.')
  }

  return payload
}
