import {alert} from './alert'
import {appCopy} from './appCopy'
import {event} from './event'
import {housingListing} from './housingListing'
import {housingProgram} from './housingProgram'
import {libraryResource} from './libraryResource'

export const schemaTypes = [alert, event, housingProgram, housingListing, libraryResource, appCopy]

/** Types edited as a single fixed document (see structure.ts). */
export const SINGLETONS = ['appCopy']
