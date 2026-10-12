import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { ReportDraftProvider } from '@/lib/report-draft';

export default function ReportLayout() {
  return (
    <ReportDraftProvider>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bgCanvas } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="details" />
        <Stack.Screen name="review" />
        <Stack.Screen name="submitted" options={{ gestureEnabled: false }} />
      </Stack>
    </ReportDraftProvider>
  );
}
