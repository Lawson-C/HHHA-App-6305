import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Camera, LocateFixed, MapPin, ShieldCheck, X } from 'lucide-react-native';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { ToggleRow } from '@/components/ui/toggle-row';
import { TopBar } from '@/components/ui/top-bar';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { blightCategory } from '@/lib/labels';
import { useReportDraft } from '@/lib/report-draft';

const MAX_PHOTOS = 5;

/** Figma 04 · Report — Details */
export default function ReportDetailsScreen() {
  const { draft, update, locate, locating, locationNote } = useReportDraft();
  const category = draft.category ? blightCategory[draft.category] : null;

  const addPhoto = () => {
    const pick = async (source: 'camera' | 'library') => {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permission needed',
          `Allow ${source === 'camera' ? 'camera' : 'photo'} access in Settings to add photos.`,
        );
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.7,
        exif: false,
        // Send JPEG, not HEIC: the server strips photo metadata and can't decode HEIC.
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        allowsMultipleSelection: source === 'library',
        selectionLimit: MAX_PHOTOS - draft.photos.length,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const added = result.assets.map((a) => ({
        uri: a.uri,
        mimeType: a.mimeType,
        fileName: a.fileName,
      }));
      update({ photos: [...draft.photos, ...added].slice(0, MAX_PHOTOS) });
    };
    Alert.alert('Add a photo', undefined, [
      { text: 'Take photo', onPress: () => pick('camera') },
      { text: 'Choose from library', onPress: () => pick('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Screen
      footer={
        <Button
          label="Review report"
          disabled={!draft.location || locating || draft.photos.length === 0}
          onPress={() => router.push('/report/review')}
          accessibilityHint={draft.photos.length === 0 ? 'Add at least one photo first' : undefined}
        />
      }>
      <TopBar title={category?.label ?? 'Report'} />
      <View style={styles.sectionHeader}>
        <Text variant="titleMedium">Photos</Text>
        <Text variant="bodySmallStrong" color="textSecondary">
          Step 2 of 2
        </Text>
      </View>
      <Text variant="bodySmall" color="textSecondary" style={{ marginTop: -8 }}>
        Add at least one photo, up to {MAX_PHOTOS}. Photos help the City find the problem.
      </Text>
      <View style={styles.photos}>
        {draft.photos.map((p, i) => (
          <View key={p.uri} style={styles.photo}>
            <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${i + 1}`}
              onPress={() => update({ photos: draft.photos.filter((x) => x.uri !== p.uri) })}
              style={styles.remove}>
              <X size={14} color={Colors.textOnBrand} />
            </Pressable>
          </View>
        ))}
        {draft.photos.length < MAX_PHOTOS ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add photo"
            onPress={addPhoto}
            style={[styles.photo, styles.addPhoto]}>
            <Camera size={22} color={Colors.textBrand} />
            <Text variant="bodySmallStrong" color="textBrand">
              Add photo
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.sectionHeader}>
        <Text variant="titleMedium">Location</Text>
        <Pressable accessibilityRole="button" onPress={locate} hitSlop={10}>
          <Text variant="bodySmallStrong" color="textBrand">
            Use my location
          </Text>
        </Pressable>
      </View>
      <Card padded={false} style={styles.mapCard}>
        <Image
          source={require('@/assets/maps/report-location.jpg')}
          style={styles.map}
          contentFit="cover"
        />
        <View style={styles.pin}>
          {locating ? (
            <ActivityIndicator color={Colors.textOnBrand} />
          ) : (
            <MapPin size={20} color={Colors.textOnBrand} />
          )}
        </View>
      </Card>
      <View style={styles.locationRow}>
        <LocateFixed size={20} color={Colors.info} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">
            {locating
              ? 'Finding your location…'
              : (draft.location?.address ??
                (draft.location
                  ? `${draft.location.latitude.toFixed(4)}, ${draft.location.longitude.toFixed(4)}`
                  : 'No location yet'))}
          </Text>
          <Text variant="bodySmall" color="textSecondary">
            {draft.location?.source === 'gps' ? 'From your current location' : (locationNote ?? '')}
          </Text>
        </View>
      </View>

      <TextField
        label="What did you see? (optional)"
        value={draft.description}
        onChangeText={(description) => update({ description })}
        multiline
        maxLength={2000}
        placeholder="For example: Old mattresses and about a dozen tires dumped behind the fence."
      />
      <Card padded={false}>
        <ToggleRow
          icon={ShieldCheck}
          title="Keep my name private"
          description="The City won't see who reported it."
          value={draft.keepNamePrivate}
          onValueChange={(keepNamePrivate) => update({ keepNamePrivate })}
        />
      </Card>
    </Screen>
  );
}

const PHOTO = 104;

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: -8,
  },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.bgSunken,
  },
  addPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.borderBrand,
    backgroundColor: 'transparent',
  },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(20,30,24,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCard: { overflow: 'hidden' },
  map: { width: '100%', aspectRatio: 362 / 150 },
  pin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bgBrand,
    borderWidth: 3,
    borderColor: Colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.raised,
  },
  locationRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: -6 },
});
