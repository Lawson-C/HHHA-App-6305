import {HomeIcon} from '@sanity/icons/Home'
import {defineArrayMember, defineField, defineType} from 'sanity'

import {housingCategories, PHONE_RE} from './shared/options'

export const housingProgram = defineType({
  name: 'housingProgram',
  title: 'Housing program',
  type: 'document',
  icon: HomeIcon,
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'category',
      type: 'string',
      options: {list: housingCategories, layout: 'radio'},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'summary',
      type: 'text',
      rows: 2,
      validation: (rule) => rule.required().max(300),
    }),
    defineField({
      name: 'highlights',
      type: 'array',
      description: 'Up to 3 quick facts, e.g. "Up to 3" / "months of rent".',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'highlight',
          fields: [
            defineField({name: 'value', type: 'string', validation: (rule) => rule.required().max(16)}),
            defineField({name: 'label', type: 'string', validation: (rule) => rule.required().max(24)}),
          ],
          preview: {select: {title: 'value', subtitle: 'label'}},
        }),
      ],
      validation: (rule) => rule.max(3),
    }),
    defineField({
      name: 'eligibility',
      title: 'Who can apply',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
    }),
    defineField({
      name: 'requiredMaterials',
      title: "What you'll need",
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
    }),
    defineField({name: 'contactName', type: 'string'}),
    defineField({
      name: 'contactPhone',
      type: 'string',
      description: 'International format, e.g. +14045550142. Shown as a Call button.',
      validation: (rule) =>
        rule.custom((value) => !value || PHONE_RE.test(value) || 'Use the format +14045550142'),
    }),
    defineField({name: 'contactEmail', type: 'string', validation: (rule) => rule.email()}),
    defineField({name: 'website', type: 'url'}),
    defineField({name: 'acceptsInquiries', type: 'boolean', initialValue: true}),
    defineField({name: 'inquiryAllowsAttachments', type: 'boolean', initialValue: true}),
  ],
  preview: {
    select: {title: 'title', category: 'category'},
    prepare: ({title, category}) => ({
      title,
      subtitle: housingCategories.find((c) => c.value === category)?.title,
    }),
  },
})
