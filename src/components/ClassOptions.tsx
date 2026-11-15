import { CLASS_GROUPS, classesInGroup, type GmsClass } from '../data/gmsClasses'

/** <optgroup> per faction with class-name options, for any class <select> */
export function ClassOptions({ suffix }: { suffix?: (c: GmsClass) => string }) {
  return (
    <>
      {CLASS_GROUPS.map(g => (
        <optgroup key={g} label={g}>
          {classesInGroup(g).map(c => <option key={c.key} value={c.key}>{c.name}{suffix?.(c) ?? ''}</option>)}
        </optgroup>
      ))}
    </>
  )
}
