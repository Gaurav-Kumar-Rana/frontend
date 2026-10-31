import { useMemo, useState } from 'react'
import {
  analyzePortfolio,
  formatCurrency,
  formatFundAge,
  type PdfTextLine,
  type PortfolioFund,
} from '../services/portfolioAnalysis'
import {
  requestPortfolioInsights,
  type FundInsight,
  type PortfolioInsightFundInput,
  type PortfolioInsights,
} from '../services/portfolioInsights'

interface PortfolioDetailsProps {
  pdfLines: PdfTextLine[] | null
  error: string | null
}

interface FundCardProps {
  label?: string
  fund: PortfolioFund
}

type FundPerformance = 'loss' | 'profit' | 'neutral'

function getFundPerformance(fund: PortfolioFund): FundPerformance {
  const differenceInPaise = Math.round(
    (fund.currentValue - fund.investedAmount) * 100,
  )

  if (differenceInPaise > 0) {
    return 'profit'
  }
  if (differenceInPaise < 0) {
    return 'loss'
  }
  return 'neutral'
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }

  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value))

  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatted}%`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(value)
}

type ChartMetric = 'appreciation' | 'unitBalance' | 'weightedAverageAgeDays'

const CHART_METRICS: Array<{
  id: ChartMetric
  label: string
  color: string
  format: (value: number) => string
}> = [
  {
    id: 'appreciation',
    label: 'Appreciation',
    color: '#42a77a',
    format: formatCurrency,
  },
  {
    id: 'unitBalance',
    label: 'Unit balance',
    color: '#7256d9',
    format: (value) => `${formatNumber(value)} units`,
  },
  {
    id: 'weightedAverageAgeDays',
    label: 'Average age',
    color: '#df9b36',
    format: (value) => `${formatNumber(value)} days`,
  },
]

function getChartLabel(name: string): string {
  const schemeCode = name.match(/\(([^()]*)\)\s*$/)?.[1]
  return schemeCode || (name.length > 12 ? `${name.slice(0, 11)}…` : name)
}

function formatAxisValue(value: number, metric: ChartMetric): string {
  const number = new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Math.abs(value))

  if (metric === 'appreciation') {
    return `${value < 0 ? '−' : ''}₹${number}`
  }
  return number
}

function PortfolioChart({ funds }: { funds: PortfolioFund[] }) {
  const [selectedMetric, setSelectedMetric] =
    useState<ChartMetric>('appreciation')
  const metric = CHART_METRICS.find(({ id }) => id === selectedMetric)!
  const values = funds.map((fund) => fund[selectedMetric])
  const maxMagnitude = Math.max(...values.map(Math.abs), 0)
  const hasNegativeValues = values.some((value) => value < 0)
  const domainMax = maxMagnitude || 1
  const domainMin = hasNegativeValues ? -domainMax : 0
  const chartHeight = 250
  const plotTop = 18
  const plotBottom = 178
  const plotHeight = plotBottom - plotTop
  const axisLeft = 80
  const columnStep = 82
  const chartWidth = Math.max(
    640,
    axisLeft + funds.length * columnStep + 16,
  )
  const zeroY =
    plotTop +
    ((domainMax - 0) / (domainMax - domainMin)) * plotHeight
  const tickCount = 4
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) =>
    domainMax - (index / tickCount) * (domainMax - domainMin),
  )

  return (
    <section className="portfolio-chart" aria-labelledby="portfolio-chart-title">
      <div className="portfolio-chart-heading">
        <div>
          <p className="eyebrow">FUND COMPARISON</p>
          <h3 id="portfolio-chart-title">{metric.label} by fund</h3>
        </div>
        <div
          className="portfolio-chart-tabs"
          role="group"
          aria-label="Choose fund chart metric"
        >
          {CHART_METRICS.map((chartMetric) => (
            <button
              key={chartMetric.id}
              className="portfolio-chart-tab"
              type="button"
              aria-pressed={selectedMetric === chartMetric.id}
              onClick={() => setSelectedMetric(chartMetric.id)}
            >
              {chartMetric.label}
            </button>
          ))}
        </div>
      </div>
      <p className="portfolio-chart-caption">
        Showing one measure at a time so each column uses a comparable scale.
        Scheme codes label the columns; focus or hover a column for the full
        fund name and value.
      </p>
      <div
        className="portfolio-chart-scroll"
        id="portfolio-chart-plot"
        aria-label={`${metric.label} column chart`}
        tabIndex={0}
      >
        <svg
          className="portfolio-column-chart"
          style={{ width: `${chartWidth}px` }}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-labelledby="portfolio-chart-title"
        >
          {ticks.map((tick, index) => {
            const y = plotTop + (index / tickCount) * plotHeight
            return (
              <g key={index}>
                <line
                  className={tick === 0 ? 'chart-zero-line' : 'chart-grid-line'}
                  x1={axisLeft}
                  x2={chartWidth}
                  y1={y}
                  y2={y}
                />
                <text className="chart-axis-label" x={axisLeft - 8} y={y + 3}>
                  {formatAxisValue(tick, selectedMetric)}
                </text>
              </g>
            )
          })}
          {funds.map((fund, index) => {
            const value = fund[selectedMetric]
            const x = axisLeft + index * columnStep + (columnStep - 34) / 2
            const valueY =
              plotTop +
              ((domainMax - value) / (domainMax - domainMin)) * plotHeight
            const barY = Math.min(valueY, zeroY)
            const barHeight = Math.max(1, Math.abs(zeroY - valueY))
            const barColor =
              selectedMetric === 'appreciation' && value < 0
                ? '#d65b63'
                : metric.color

            return (
              <g key={fund.name}>
                <rect
                  className="chart-column"
                  x={x}
                  y={barY}
                  width="34"
                  height={barHeight}
                  rx="4"
                  fill={barColor}
                  tabIndex={0}
                  aria-label={`${fund.name}: ${metric.format(value)}`}
                >
                  <title>{`${fund.name}: ${metric.format(value)}`}</title>
                </rect>
                <text
                  className="chart-value-label"
                  x={x + 17}
                  y={
                    value < 0
                      ? barY + barHeight + 12
                      : Math.max(plotTop + 10, barY - 5)
                  }
                  textAnchor="middle"
                >
                  {formatAxisValue(value, selectedMetric)}
                </text>
                <text
                  className="chart-fund-label"
                  x={x + 17}
                  y={chartHeight - 22}
                  textAnchor="middle"
                >
                  {getChartLabel(fund.name)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </section>
  )
}

function PortfolioSnapshot({ funds }: { funds: PortfolioFund[] }) {
  const invested = funds.reduce((total, fund) => total + fund.investedAmount, 0)
  const current = funds.reduce((total, fund) => total + fund.currentValue, 0)
  const appreciation = current - invested
  const absoluteReturn = invested > 0 ? (appreciation / invested) * 100 : null

  return (
    <section
      className="portfolio-snapshot"
      aria-labelledby="portfolio-snapshot-title"
    >
      <h3 id="portfolio-snapshot-title">Portfolio at a glance</h3>
      <dl>
        <div>
          <dt>Current value</dt>
          <dd>{formatCurrency(current)}</dd>
        </div>
        <div>
          <dt>Invested</dt>
          <dd>{formatCurrency(invested)}</dd>
        </div>
        <div>
          <dt>Total appreciation</dt>
          <dd>{formatCurrency(appreciation)}</dd>
        </div>
        <div>
          <dt>Absolute return</dt>
          <dd>{formatPercent(absoluteReturn)}</dd>
        </div>
      </dl>
      <p>Values reflect this statement only; past returns do not predict future results.</p>
    </section>
  )
}

function FundCard({ label, fund }: FundCardProps) {
  const absoluteReturn =
    fund.investedAmount > 0
      ? ((fund.currentValue - fund.investedAmount) / fund.investedAmount) * 100
      : null
  const performance = getFundPerformance(fund)

  return (
    <article className={`fund-card fund-card--${performance}`}>
      {label && <p className="portfolio-summary-label">{label}</p>}
      <h3>{fund.name}</h3>
      <p className={`fund-performance fund-performance--${performance}`}>
        {performance === 'neutral'
          ? 'Neutral'
          : performance === 'profit'
            ? 'Profit'
            : 'Loss'}
      </p>
      <dl className="fund-metrics">
        <div>
          <dt>Absolute return</dt>
          <dd>{formatPercent(absoluteReturn)}</dd>
        </div>
        <div>
          <dt>XIRR</dt>
          <dd>{formatPercent(fund.annualizedXirr)}</dd>
        </div>
        <div>
          <dt>Weighted average age</dt>
          <dd>{formatFundAge(fund.weightedAverageAgeDays)}</dd>
        </div>
      </dl>
      <div className="portfolio-summary-values">
        <span>
          <small>Invested</small>
          {formatCurrency(fund.investedAmount)}
        </span>
        <span>
          <small>Current value</small>
          {formatCurrency(fund.currentValue)}
        </span>
      </div>
    </article>
  )
}

function FundAccordion({
  fund,
  allocation,
  insight,
}: {
  fund: PortfolioFund
  allocation: number | null
  insight?: FundInsight
}) {
  const performance = getFundPerformance(fund)
  const absoluteReturn =
    fund.investedAmount > 0
      ? ((fund.currentValue - fund.investedAmount) / fund.investedAmount) * 100
      : null

  return (
    <details className={`fund-accordion fund-card--${performance}`}>
      <summary>
        <h4>{fund.name}</h4>
        <span className={`fund-performance fund-performance--${performance}`}>
          {performance === 'neutral'
            ? 'Neutral'
            : performance === 'profit'
              ? 'Profit'
              : 'Loss'}
        </span>
      </summary>
      <div className="fund-accordion-content">
        <dl className="fund-metrics">
          <div>
            <dt>Absolute return</dt>
            <dd>{formatPercent(absoluteReturn)}</dd>
          </div>
          <div>
            <dt>XIRR</dt>
            <dd>{formatPercent(fund.annualizedXirr)}</dd>
          </div>
          <div>
            <dt>Weighted average age</dt>
            <dd>{formatFundAge(fund.weightedAverageAgeDays)}</dd>
          </div>
          <div>
            <dt>Share of portfolio value</dt>
            <dd>{formatPercent(allocation)}</dd>
          </div>
        </dl>
        {insight && <FundInsightCard insight={insight} />}
        <div className="portfolio-summary-values">
          <span>
            <small>Invested</small>
            {formatCurrency(fund.investedAmount)}
          </span>
          <span>
            <small>Current value</small>
            {formatCurrency(fund.currentValue)}
          </span>
        </div>
      </div>
    </details>
  )
}

const INSIGHT_STANCE_LABELS = {
  consider_add: 'Consider adding — review first',
  hold_or_monitor: 'Hold / monitor',
  review_reduce_or_switch: 'Review reduction or switch',
  insufficient_data: 'Insufficient evidence',
} as const

function FundInsightCard({ insight }: { insight: FundInsight }) {
  return (
    <section className="fund-insight" aria-label={`Research for ${insight.fundName}`}>
      <h5>{INSIGHT_STANCE_LABELS[insight.stance]}</h5>
      <p>{insight.rationale}</p>
      {insight.supportingSignals.length > 0 && (
        <>
          <strong>Signals</strong>
          <ul>
            {insight.supportingSignals.map((signal, index) => (
              <li key={`${index}-${signal}`}>{signal}</li>
            ))}
          </ul>
        </>
      )}
      {insight.risks.length > 0 && (
        <>
          <strong>Risks and unknowns</strong>
          <ul>
            {insight.risks.map((risk, index) => (
              <li key={`${index}-${risk}`}>{risk}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function PortfolioResearch({
  insights,
  loading,
  error,
  onAnalyze,
}: {
  insights: PortfolioInsights | null
  loading: boolean
  error: string | null
  onAnalyze: () => void
}) {
  return (
    <section className="portfolio-research" aria-labelledby="portfolio-research-title">
      <div className="portfolio-research-heading">
        <div>
          <p className="eyebrow">LOCAL AI REVIEW</p>
          <h3 id="portfolio-research-title">Portfolio signals</h3>
        </div>
        <button
          className="action-button action-button-primary"
          type="button"
          disabled={loading}
          onClick={onAnalyze}
        >
          {loading ? 'Analyzing locally…' : insights ? 'Analyze again' : 'Analyze locally'}
        </button>
      </div>
      <p className="portfolio-research-disclosure">
        Runs only when you click. Fund names, invested/current values, returns,
        age, and portfolio share are sent to Ollama running on this computer;
        the PDF is not. No live market, fund, or global news data is used.
        Signals are educational, not trade instructions. A 12% annual return
        is an aspiration, not a forecast or guarantee.
      </p>
      {loading && (
        <p className="portfolio-research-status" role="status">
          Reviewing statement metrics with the local model…
        </p>
      )}
      {error && (
        <p className="portfolio-research-error" role="alert">
          {error}
        </p>
      )}
      {insights && (
        <div className="portfolio-research-results">
          <p className="portfolio-research-market">{insights.reviewSummary}</p>
          {insights.portfolioNotes.length > 0 && (
            <ul>
              {insights.portfolioNotes.map((note, index) => (
                <li key={`${index}-${note}`}>{note}</li>
              ))}
            </ul>
          )}
          <p className="portfolio-research-timestamp">
            Research completed {new Date(insights.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </section>
  )
}

function PortfolioDetails({ pdfLines, error }: PortfolioDetailsProps) {
  const [insights, setInsights] = useState<PortfolioInsights | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const funds = useMemo(
    () => (pdfLines ? analyzePortfolio(pdfLines) : []),
    [pdfLines],
  )
  const oldest = funds.reduce<PortfolioFund | null>(
    (selected, fund) =>
      selected === null ||
      fund.weightedAverageAgeDays > selected.weightedAverageAgeDays
        ? fund
        : selected,
    null,
  )
  const newest = funds.reduce<PortfolioFund | null>(
    (selected, fund) =>
      selected === null ||
      fund.weightedAverageAgeDays < selected.weightedAverageAgeDays
        ? fund
        : selected,
    null,
  )
  const maxInvested = funds.reduce<PortfolioFund | null>(
    (selected, fund) =>
      selected === null || fund.investedAmount > selected.investedAmount
        ? fund
        : selected,
    null,
  )
  const leastInvested = funds.reduce<PortfolioFund | null>(
    (selected, fund) =>
      selected === null || fund.investedAmount < selected.investedAmount
        ? fund
        : selected,
    null,
  )
  const totalCurrentValue = funds.reduce(
    (total, fund) => total + fund.currentValue,
    0,
  )
  const insightFundInputs = funds.map((fund): PortfolioInsightFundInput => ({
    name: fund.name,
    investedAmount: fund.investedAmount,
    currentValue: fund.currentValue,
    absoluteReturnPercent:
      fund.investedAmount > 0
        ? ((fund.currentValue - fund.investedAmount) / fund.investedAmount) *
          100
        : null,
    annualizedXirr: fund.annualizedXirr,
    weightedAverageAgeDays: fund.weightedAverageAgeDays,
    portfolioSharePercent:
      totalCurrentValue > 0
        ? (fund.currentValue / totalCurrentValue) * 100
        : 0,
  }))

  async function handleAnalyze() {
    setInsightsLoading(true)
    setInsightsError(null)
    try {
      setInsights(await requestPortfolioInsights(insightFundInputs))
    } catch (error) {
      setInsightsError(
        error instanceof Error
          ? error.message
          : 'Could not analyze the portfolio with the local model.',
      )
    } finally {
      setInsightsLoading(false)
    }
  }

  return (
    <section
      className="portfolio-details"
      aria-labelledby="portfolio-details-title"
    >
      <div className="portfolio-details-heading">
        <div>
          <p className="eyebrow">PORTFOLIO OVERVIEW</p>
          <h2 id="portfolio-details-title">Mutual fund details</h2>
        </div>
        {funds.length > 0 && (
          <span className="portfolio-fund-count">
            {funds.length} {funds.length === 1 ? 'fund' : 'funds'} analyzed
          </span>
        )}
      </div>

      {!pdfLines && !error && (
        <div className="portfolio-analysis-state" role="status">
          Extracting portfolio details from the statement…
        </div>
      )}

      {error && (
        <div className="portfolio-analysis-state portfolio-analysis-error" role="alert">
          Could not read the portfolio statement: {error}
        </div>
      )}

      {pdfLines && funds.length === 0 && (
        <div className="portfolio-analysis-state" role="status">
          Could not identify fund names, weighted-average ages, invested
          amounts, and current values in this statement. Open the source PDF
          below to review it.
        </div>
      )}

      {funds.length > 0 &&
        oldest &&
        newest &&
        maxInvested &&
        leastInvested && (
          <>
            <PortfolioSnapshot funds={funds} />
            <PortfolioChart funds={funds} />
            <PortfolioResearch
              insights={insights}
              loading={insightsLoading}
              error={insightsError}
              onAnalyze={() => void handleAnalyze()}
            />
            <div className="portfolio-summary-grid">
              <FundCard label="Oldest MF" fund={oldest} />
              <FundCard
                label="Max investment amount in MF"
                fund={maxInvested}
              />
              <FundCard label="Newest MF" fund={newest} />
              <FundCard
                label="Least investment amount in MF"
                fund={leastInvested}
              />
            </div>
            <h3 className="portfolio-holdings-title">All mutual funds</h3>
            <div className="portfolio-holdings-grid">
              {funds.map((fund) => (
                <FundAccordion
                  key={fund.name}
                  fund={fund}
                  allocation={
                    totalCurrentValue > 0
                      ? (fund.currentValue / totalCurrentValue) * 100
                      : null
                  }
                  insight={insights?.funds.find(
                    (item) => item.fundName === fund.name,
                  )}
                />
              ))}
            </div>
          </>
        )}
    </section>
  )
}

export default PortfolioDetails
