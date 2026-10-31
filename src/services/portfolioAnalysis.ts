export interface PdfTextRun {
  text: string
  x: number
}

export interface PdfTextLine {
  pageNumber: number
  y: number
  runs: PdfTextRun[]
}

export interface PortfolioFund {
  name: string
  unitBalance: number
  appreciation: number
  weightedAverageAgeDays: number
  investedAmount: number
  currentValue: number
  annualizedXirr: number | null
}

interface FundRow {
  y: number
  unitBalance: number
  appreciation: number
  investedAmount: number
  currentValue: number
  weightedAverageAgeDays: number
  annualizedXirr: number | null
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

function parseNumber(value: string): number | null {
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) {
    return null
  }

  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function getValueInRange(
  line: PdfTextLine,
  minX: number,
  maxX: number,
): number | null {
  for (const run of line.runs) {
    if (run.x < minX || run.x >= maxX) {
      continue
    }

    const value = parseNumber(run.text)
    if (value !== null) {
      return value
    }
  }

  return null
}

function getValueAtOrAfter(line: PdfTextLine, startX: number): number | null {
  for (const run of [...line.runs].sort((first, second) => first.x - second.x)) {
    if (run.x < startX) {
      continue
    }

    const value = parseNumber(run.text)
    if (value !== null) {
      return value
    }
  }

  return null
}

function getXirrColumnStartX(
  lines: PdfTextLine[],
  sectionStartY: number,
): number | null {
  const headerRuns = lines
    .filter((line) => line.y < sectionStartY)
    .filter(
      (line) =>
        line.runs.some((run) => /age\s*days/i.test(run.text)) &&
        line.runs.some((run) => /xirr/i.test(run.text)),
    )
    .flatMap((line) => line.runs)
    .filter((run) => /xirr/i.test(run.text))

  return headerRuns.length
    ? Math.min(...headerRuns.map((run) => run.x))
    : null
}

function getSectionTwoPage(lines: PdfTextLine[]): PdfTextLine[] {
  const pages = new Map<number, PdfTextLine[]>()
  for (const line of lines) {
    const pageLines = pages.get(line.pageNumber) ?? []
    pageLines.push(line)
    pages.set(line.pageNumber, pageLines)
  }

  for (const pageLines of pages.values()) {
    const hasMutualFundSection = pageLines.some((line) =>
      line.runs.some((run) =>
        /section\s*2\s*:\s*by\s*mutual\s*fund/i.test(run.text),
      ),
    )
    if (hasMutualFundSection) {
      return pageLines
    }
  }

  return []
}

function getSectionStartY(lines: PdfTextLine[]): number | null {
  return (
    lines.find((line) =>
      line.runs.some((run) =>
        /section\s*2\s*:\s*by\s*mutual\s*fund/i.test(run.text),
      ),
    )?.y ?? null
  )
}

function getFundRows(
  lines: PdfTextLine[],
  sectionStartY: number,
): FundRow[] {
  const sortedLines = [...lines].sort((first, second) => second.y - first.y)
  const xirrColumnStartX = getXirrColumnStartX(lines, sectionStartY)
  const candidates = sortedLines.flatMap((line) => {
    if (line.y >= sectionStartY) {
      return []
    }

    const currentValue = getValueInRange(line, 545, 615)
    const investedAmount = getValueInRange(line, 615, 675)
    const unitBalance = getValueInRange(line, 420, 545)
    const appreciation = getValueInRange(line, 675, 735)
    if (
      currentValue === null ||
      investedAmount === null ||
      unitBalance === null ||
      appreciation === null
    ) {
      return []
    }

    const ageLine = sortedLines
      .filter((candidate) => Math.abs(candidate.y - line.y) <= 3)
      .map((candidate) => getValueInRange(candidate, 735, 775))
      .find((age): age is number => age !== null && Number.isInteger(age))

    if (
      ageLine === undefined ||
      currentValue < 0 ||
      investedAmount < 0
    ) {
      return []
    }

    return [{
      y: line.y,
      unitBalance,
      appreciation,
      currentValue,
      investedAmount,
      weightedAverageAgeDays: ageLine,
      annualizedXirr:
        xirrColumnStartX === null
          ? null
          : getValueAtOrAfter(line, xirrColumnStartX),
    }]
  })

  return candidates.sort((first, second) => second.y - first.y)
}

function getFundName(
  lines: PdfTextLine[],
  row: FundRow,
  nextRow: FundRow | undefined,
): string {
  const nameLines = lines
    .filter(
      (line) =>
        line.y <= row.y + 1 &&
        line.y >= row.y - 22 &&
        (nextRow === undefined || line.y > nextRow.y) &&
        line.runs.some((run) => run.x < 220),
    )
    .sort((first, second) => second.y - first.y)

  return nameLines
    .map((line) =>
      line.runs
        .filter((run) => run.x < 220)
        .map((run) => run.text)
        .join(' ')
        .trim(),
    )
    .filter((text) => text && !/\bmutual fund$/i.test(text))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function aggregateFunds(funds: PortfolioFund[]): PortfolioFund[] {
  const aggregated = new Map<
    string,
    PortfolioFund & {
      weightedAgeTotal: number
      weightedXirrTotal: number
      xirrInvestedAmount: number
    }
  >()

  for (const fund of funds) {
    const key = normalizeText(fund.name)
    const existing = aggregated.get(key)
    if (!existing) {
      aggregated.set(key, {
        ...fund,
        weightedAgeTotal:
          fund.weightedAverageAgeDays * fund.investedAmount,
        weightedXirrTotal:
          (fund.annualizedXirr ?? 0) * fund.investedAmount,
        xirrInvestedAmount:
          fund.annualizedXirr === null ? 0 : fund.investedAmount,
      })
      continue
    }

    existing.weightedAgeTotal +=
      fund.weightedAverageAgeDays * fund.investedAmount
    if (fund.annualizedXirr !== null) {
      existing.weightedXirrTotal += fund.annualizedXirr * fund.investedAmount
      existing.xirrInvestedAmount += fund.investedAmount
    }
    existing.investedAmount += fund.investedAmount
    existing.currentValue += fund.currentValue
    existing.unitBalance += fund.unitBalance
    existing.appreciation += fund.appreciation
    if (existing.investedAmount > 0) {
      existing.weightedAverageAgeDays =
        existing.weightedAgeTotal / existing.investedAmount
    }
    existing.annualizedXirr =
      existing.xirrInvestedAmount > 0
        ? existing.weightedXirrTotal / existing.xirrInvestedAmount
        : null
  }

  return [...aggregated.values()].map(
    ({
      weightedAgeTotal: _weightedAgeTotal,
      weightedXirrTotal: _weightedXirrTotal,
      xirrInvestedAmount: _xirrInvestedAmount,
      ...fund
    }) => fund,
  )
}

export function analyzePortfolio(lines: PdfTextLine[]): PortfolioFund[] {
  const pageLines = getSectionTwoPage(lines)
  const sectionStartY = getSectionStartY(pageLines)
  if (!pageLines.length || sectionStartY === null) {
    return []
  }

  const rows = getFundRows(pageLines, sectionStartY)
  const funds = rows.flatMap((row, index) => {
    const name = getFundName(pageLines, row, rows[index + 1])
    if (!name) {
      return []
    }

    return [
      {
        name,
        unitBalance: row.unitBalance,
        appreciation: row.appreciation,
        weightedAverageAgeDays: row.weightedAverageAgeDays,
        investedAmount: row.investedAmount,
        currentValue: row.currentValue,
        annualizedXirr: row.annualizedXirr,
      },
    ]
  })

  return aggregateFunds(funds)
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatFundAge(days: number): string {
  const roundedDays = Math.round(days)
  const years = Math.floor(roundedDays / 365)
  const remainingDays = roundedDays % 365
  const months = Math.floor(remainingDays / 30)
  const daysInMonth = remainingDays % 30
  const parts: string[] = []

  if (years > 0) {
    parts.push(`${years} ${years === 1 ? 'year' : 'years'}`)
  }
  if (months > 0) {
    parts.push(`${months} ${months === 1 ? 'month' : 'months'}`)
  }
  if (daysInMonth > 0 || parts.length === 0) {
    parts.push(`${daysInMonth} ${daysInMonth === 1 ? 'day' : 'days'}`)
  }

  return `${parts.join(', ')} (${roundedDays.toLocaleString('en-IN')} days)`
}
