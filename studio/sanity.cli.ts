import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: 'nxvenp1m',
    dataset: 'production'
  },
  /** Hosted Studio: https://historic-hunter-hills.sanity.studio */
  studioHost: 'historic-hunter-hills',
  deployment: {
    appId: 'qjwku06vz7llshlsddmmvynf',
    /**
     * Enable auto-updates for studios.
     * Learn more at https://www.sanity.io/docs/studio/latest-version-of-sanity#k47faf43faf56
     */
    autoUpdates: true,
  },
})
