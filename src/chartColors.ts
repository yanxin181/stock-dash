export const chartColors = {
  stocks: ['#2756F1', '#8B5CC7'],
  stocksHighlighted: ['#173BB5', '#633A9C'],
  rise: '#D94A4A',
  fall: '#16865E',
  flat: '#7B8794',
  riseHighlighted: '#A72A2A',
  fallHighlighted: '#0B6042',
  flatHighlighted: '#525E6B',
  highlightBorder: '#FFC151',
}

export const changeColor = (value: number) => value > 0 ? chartColors.rise : value < 0 ? chartColors.fall : chartColors.flat
export const highlightedChangeColor = (value: number) => value > 0 ? chartColors.riseHighlighted : value < 0 ? chartColors.fallHighlighted : chartColors.flatHighlighted
