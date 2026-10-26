import {TextIcon} from '@sanity/icons/Text'
import {defineArrayMember, defineField, defineType} from 'sanity'

/**
 * Singleton (document id "appCopy"): editable text that appears in the app. Every field is
 * optional; the app falls back to its built-in wording when a field is empty.
 */
export const appCopy = defineType({
  name: 'appCopy',
  title: 'App text',
  type: 'document',
  icon: TextIcon,
  groups: [
    {name: 'home', title: 'Welcome & home', default: true},
    {name: 'housing', title: 'Housing'},
    {name: 'report', title: 'Reporting'},
    {name: 'environment', title: 'Neighborhood data'},
  ],
  fields: [
    defineField({
      name: 'welcomeTagline',
      type: 'text',
      rows: 2,
      group: 'home',
      description: 'Under the logo on the first screen.',
    }),
    defineField({name: 'evictionBannerTitle', type: 'string', group: 'housing'}),
    defineField({name: 'evictionBannerBody', type: 'string', group: 'housing'}),
    defineField({
      name: 'inquiryConfirmation',
      type: 'text',
      rows: 2,
      group: 'housing',
      description: 'Shown after a resident sends a housing inquiry.',
    }),
    defineField({
      name: 'reportingSteps',
      title: '"How reporting works" steps',
      type: 'array',
      group: 'report',
      of: [defineArrayMember({type: 'string'})],
      validation: (rule) => rule.max(5),
    }),
    defineField({name: 'emergencyNotice', type: 'string', group: 'report', description: 'e.g. "If someone is in danger or there\'s a fire, call 911 first."'}),
    defineField({name: 'airQualityExplainer', type: 'text', rows: 3, group: 'environment'}),
    defineField({name: 'waterQualityExplainer', type: 'text', rows: 3, group: 'environment'}),
    defineField({name: 'heatExplainer', type: 'text', rows: 3, group: 'environment'}),
    defineField({name: 'mosquitoExplainer', type: 'text', rows: 3, group: 'environment'}),
    defineField({name: 'heatMapNote', type: 'text', rows: 2, group: 'environment', description: 'Under the "Heat zones today" map.'}),
  ],
  preview: {prepare: () => ({title: 'App text'})},
})
