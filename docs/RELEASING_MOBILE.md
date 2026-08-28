# Releasing the mobile app to Google Play

Package: **`org.vulturenest.aes`** · Play listing: **AES Operations**

## Cutting a release

```bash
git tag mobile-v1.2.0
git push origin mobile-v1.2.0
```

The `Release Mobile` workflow then analyses, tests, builds a signed app bundle
and uploads it to the **internal** track.

To pick the track yourself, use *Actions → Release Mobile → Run workflow* and
choose `internal`, `alpha`, `beta` or `production`.

## Versioning

| Field | Source |
|---|---|
| `versionName` | the tag, minus the `mobile-v` prefix — must be semver |
| `versionCode` | the workflow run number, which only ever increases |

Play requires a strictly increasing `versionCode`. Because it comes from the run
number rather than the tag, re-running a release always produces a fresh code —
you never have to bump anything by hand.

## First upload is manual

The Play Developer API refuses a package that has never had a release, so the
**first** bundle must be uploaded by hand:

1. Build locally (see below) or download the `.aab` artifact from a workflow run.
2. Play Console → *Testing → Internal testing → Create new release* → upload.
3. Complete the store listing, content rating, data safety and target audience
   sections. Play blocks releases until all are green.

Every release after that is automatic.

## Building a signed bundle locally

Copy the keystore somewhere outside the repo, then create
`apps/mobile/android/key.properties` (gitignored):

```properties
storeFile=/absolute/path/to/aes-upload.jks
storePassword=...
keyAlias=aes-upload
keyPassword=...
```

```bash
cd apps/mobile
flutter build appbundle --flavor prod -t lib/main_prod.dart
```

Without `key.properties` the release build falls back to the debug key so the
command still works — but **that artifact is not publishable**; Play rejects
debug-signed bundles. Check what you actually produced with:

```bash
jarsigner -verify -verbose:summary -certs \
  build/app/outputs/bundle/prodRelease/app-prod-release.aab | grep X.509
```

`CN=Vulturenest` is correct. `CN=Android Debug` is not.

## Repository secrets

| Secret | Purpose |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of the upload keystore |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | Play service-account key, granted *Release manager* on the app |

## Losing the upload key

Not fatal. Under Play App Signing, Google holds the real signing key and the
keystore here is only the *upload* key. If it is lost, request an upload key
reset in Play Console and replace the four `ANDROID_*` secrets. Users are
unaffected.

## Tracks

`internal` (up to 100 testers, no review delay) → `alpha` → `beta` →
`production`. Promotion is a manual step in Play Console; the pipeline only ever
publishes to the track it was told to.
