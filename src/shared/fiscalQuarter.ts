export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'

export interface QuarterInfo {
  year: number
  quarter: Quarter | ''
  key: string
  range: string
  order: number
}

export function getFiscalQuarter(monthString: string): QuarterInfo {
  if (!/^\d{4}-\d{2}$/.test(String(monthString || '')))
    return { year: 0, quarter: '', key: '', range: '', order: 0 }
  const [yearText, monthText] = monthString.split('-')
  const rawYear = Number(yearText)
  const month = Number(monthText)
  let year = rawYear
  let quarter: Quarter
  if ([2, 3, 4].includes(month)) quarter = 'Q1'
  else if ([5, 6, 7].includes(month)) quarter = 'Q2'
  else if ([8, 9, 10].includes(month)) quarter = 'Q3'
  else {
    quarter = 'Q4'
    if (month === 1) year = rawYear - 1
  }
  return {
    year,
    quarter,
    key: `${year}-${quarter}`,
    range: quarterRange(year, quarter),
    order: year * 10 + Number(quarter.slice(1)),
  }
}

function quarterRange(year: number, quarter: Quarter): string {
  return {
    Q1: `${year}/02-${year}/04`,
    Q2: `${year}/05-${year}/07`,
    Q3: `${year}/08-${year}/10`,
    Q4: `${year}/11-${year + 1}/01`,
  }[quarter]
}
