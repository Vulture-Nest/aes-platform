import 'package:local_auth/local_auth.dart';

/// Gate for confirming sensitive actions (money approvals) with the device
/// biometric / passcode. Abstracted so cubits/widgets depend on the interface
/// and tests inject a deterministic fake.
abstract class BiometricAuthenticator {
  /// Prompt for confirmation. Returns true only on a successful check. When no
  /// biometric hardware is enrolled, implementations fall back to the device
  /// passcode; if even that is unavailable the action is allowed to proceed
  /// (the API still enforces authorization).
  Future<bool> confirm(String reason);
}

class LocalAuthBiometricAuthenticator implements BiometricAuthenticator {
  LocalAuthBiometricAuthenticator([LocalAuthentication? auth])
      : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  @override
  Future<bool> confirm(String reason) async {
    try {
      final supported = await _auth.isDeviceSupported();
      if (!supported) {
        // No lock screen configured — don't block the workflow; the API is the
        // real authority. (Enforce device security via MDM in production.)
        return true;
      }
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}

/// Always-allow authenticator for tests / platforms without a lock screen.
class AlwaysConfirmAuthenticator implements BiometricAuthenticator {
  const AlwaysConfirmAuthenticator();

  @override
  Future<bool> confirm(String reason) async => true;
}
