// Join types with a plain description, for the join pickers on the canvas and in the
// List view. `left` is the earlier table, `right` the joined one (names or aliases).
import { JOIN_TYPES } from '@/utils/builderCanvas.js'

const DESCRIBE = {
  'INNER JOIN': () => 'Only rows in both',
  'LEFT JOIN': (l, r) => `All ${l} rows, matching ${r}`,
  'RIGHT JOIN': (l, r) => `All ${r} rows, matching ${l}`,
  'FULL OUTER JOIN': () => 'All rows from both',
}

/** The four join types, each with its label and a description naming the two tables. */
export function joinChoices(left = 'left', right = 'right') {
  return JOIN_TYPES.map((j) => ({ ...j, desc: (DESCRIBE[j.value] || (() => ''))(left || 'left', right || 'right') }))
}

export function describeJoin(type, left, right) {
  return joinChoices(left, right).find((j) => j.value === (type || 'INNER JOIN'))?.desc || ''
}
