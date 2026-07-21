import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';

/// A captured receipt image ready to upload.
class CapturedReceipt {
  const CapturedReceipt({required this.bytes, required this.filename, required this.contentType});

  final Uint8List bytes;
  final String filename;
  final String contentType;
}

/// Captures a receipt from the camera or gallery. Abstracted so widgets depend on
/// the interface and tests inject a deterministic fake (no platform channels).
abstract class ReceiptCapture {
  /// Returns the captured image, or null if the user cancelled.
  Future<CapturedReceipt?> capture({required bool fromCamera});
}

class ImagePickerReceiptCapture implements ReceiptCapture {
  ImagePickerReceiptCapture([ImagePicker? picker]) : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  @override
  Future<CapturedReceipt?> capture({required bool fromCamera}) async {
    final file = await _picker.pickImage(
      source: fromCamera ? ImageSource.camera : ImageSource.gallery,
      // Compress so the base64 upload stays small (mine sites have thin links).
      maxWidth: 1600,
      imageQuality: 70,
    );
    if (file == null) {
      return null;
    }
    final bytes = await file.readAsBytes();
    final name = file.name.isEmpty ? 'receipt.jpg' : file.name;
    return CapturedReceipt(
      bytes: bytes,
      filename: name,
      contentType: _mimeFor(name),
    );
  }

  static String _mimeFor(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }
}
