// An item's grade (questlog's: 11 common, 21, 31, 41 Unique, 51, 61, 71 Mythic) as the game names and
// colours it: every place an item's grade shows.
const GRADES: { min: number; name: string; class: string }[] = [
  { min: 71, name: 'Mythic', class: 'text-accent' },
  { min: 61, name: 'Ancient', class: 'text-orange' },
  { min: 51, name: 'Legendary', class: 'text-orange' },
  { min: 41, name: 'Unique', class: 'text-yellow' },
  { min: 31, name: 'Rare', class: 'text-blue' },
  { min: 21, name: 'Uncommon', class: 'text-green' },
  { min: 0, name: 'Common', class: 'text-dark' },
]
const of = (grade: number) => GRADES.find((g) => grade >= g.min)!

/** A grade's name: Common, Uncommon, Rare, Unique, Legendary, Ancient, Mythic. */
export const gradeName = (grade: number): string => of(grade).name
/** A grade's colour, as a text class. */
export const gradeClass = (grade: number): string => of(grade).class
