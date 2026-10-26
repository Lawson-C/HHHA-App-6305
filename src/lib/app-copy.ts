import { useQuery } from '@tanstack/react-query';

import { getAppCopy, type AppCopy } from '@/lib/api/content';
import { storage, StorageKeys } from '@/lib/storage';

/**
 * Built-in wording, used until Sanity's "App text" document fills a field in.
 * Staff edit these in the Studio (App text); see docs/design/ui-spec.md.
 */
export const defaultCopy: Required<AppCopy> = {
  welcomeTagline:
    'Alerts, help and events for English Avenue, Vine City and Hunter Hills, all in one place.',
  evictionBannerTitle: 'Facing eviction?',
  evictionBannerBody: 'Free legal help is available today.',
  inquiryConfirmation:
    'The Foundation team will contact you soon about this program, using the contact method you chose.',
  reportingSteps: [
    'The Foundation team reviews your report, usually within 2 days.',
    'If the City needs to act, we file a 311 request for you.',
    "You get a notification at each step until it's resolved.",
  ],
  emergencyNotice: "If someone is in danger or there's a fire, call 911 first.",
  airQualityExplainer:
    'The Air Quality Index (AQI) runs from 0 to 500. Under 50 is good. Over 100, people with asthma, heart disease, older adults and children should limit time outside.',
  waterQualityExplainer:
    'Tap water status comes from the City of Atlanta. During a boil water advisory, boil water for at least one minute before drinking or cooking with it.',
  heatExplainer:
    'The heat index is how hot it feels when humidity is added to the temperature. On hot days, take breaks in the shade and drink water often.',
  mosquitoExplainer:
    'Mosquito risk is based on Fulton County Health spraying and trap reports. Empty standing water around your home to lower the risk.',
  heatMapNote: 'Darker orange areas get hotter in the afternoon.',
};

function readCached(): AppCopy | undefined {
  const raw = storage.get(StorageKeys.appCopy);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as AppCopy;
  } catch {
    return undefined;
  }
}

/** Merge CMS text over the defaults; blank CMS fields keep the default. */
function withDefaults(copy: AppCopy | undefined): Required<AppCopy> {
  const merged = { ...defaultCopy };
  for (const [key, value] of Object.entries(copy ?? {})) {
    const isBlank = value == null || value === '' || (Array.isArray(value) && value.length === 0);
    if (!isBlank && key in merged) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

/** App text from Sanity, cached on the device so it shows instantly and offline. */
export function useAppCopy(): Required<AppCopy> {
  const { data } = useQuery({
    queryKey: ['app-copy'],
    queryFn: async () => {
      const copy = await getAppCopy();
      storage.set(StorageKeys.appCopy, JSON.stringify(copy));
      return copy;
    },
    initialData: readCached,
    initialDataUpdatedAt: 0, // always refresh in the background
    staleTime: 10 * 60_000,
  });
  return withDefaults(data);
}
