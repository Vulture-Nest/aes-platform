import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/project_node.dart';
import '../../services/receipt_capture.dart';
import 'cubit/project_detail_cubit.dart';

/// A deliberately light progress-update sheet for a WBS node: a % slider, a
/// one-line note, a "mark complete" toggle and an optional progress photo. The
/// photo reuses the same image_picker → /v1/attachments flow requests use for
/// receipts. On save the parent screen refreshes to reflect the new roll-up.
class UpdateProgressSheet extends StatefulWidget {
  const UpdateProgressSheet({super.key, required this.node});

  final ProjectNode node;

  @override
  State<UpdateProgressSheet> createState() => _UpdateProgressSheetState();
}

class _UpdateProgressSheetState extends State<UpdateProgressSheet> {
  late double _percent = widget.node.percentComplete.clamp(0, 100).toDouble();
  final _note = TextEditingController();
  bool _complete = false;
  CapturedReceipt? _photo;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _capture(bool fromCamera) async {
    final capture = context.read<ReceiptCapture>();
    try {
      final photo = await capture.capture(fromCamera: fromCamera);
      if (photo != null && mounted) setState(() => _photo = photo);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not capture the photo')),
        );
      }
    }
  }

  Future<void> _save() async {
    final error = await context.read<ProjectDetailCubit>().updateNodeProgress(
          widget.node.id,
          percentComplete: _complete ? 100 : _percent,
          note: _note.text,
          complete: _complete,
          photo: _photo,
        );
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop(true);
    } else {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final node = widget.node;
    final saving = context.select((ProjectDetailCubit c) => c.state.saving);
    final effectivePercent = _complete ? 100.0 : _percent;
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(node.type.label, style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: 2),
            Text(node.title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Progress', style: Theme.of(context).textTheme.titleMedium),
                Text('${effectivePercent.round()}%', style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            Slider(
              value: effectivePercent,
              min: 0,
              max: 100,
              divisions: 20,
              label: '${effectivePercent.round()}%',
              onChanged: (saving || _complete)
                  ? null
                  : (v) => setState(() => _percent = v),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _note,
              enabled: !saving,
              decoration: const InputDecoration(
                labelText: 'Note (optional)',
                hintText: 'What changed on site?',
              ),
              textInputAction: TextInputAction.done,
              maxLines: 1,
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Mark complete'),
              subtitle: const Text('Sets this to 100%'),
              value: _complete,
              onChanged: saving ? null : (v) => setState(() => _complete = v),
            ),
            const SizedBox(height: 8),
            _PhotoField(
              photo: _photo,
              busy: saving,
              onCamera: () => _capture(true),
              onGallery: () => _capture(false),
              onRemove: () => setState(() => _photo = null),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: saving ? null : _save,
              icon: saving
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.save_outlined),
              label: const Text('Save progress'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Optional progress-photo row: camera/gallery buttons, or a thumbnail once set.
class _PhotoField extends StatelessWidget {
  const _PhotoField({
    required this.photo,
    required this.busy,
    required this.onCamera,
    required this.onGallery,
    required this.onRemove,
  });

  final CapturedReceipt? photo;
  final bool busy;
  final VoidCallback onCamera;
  final VoidCallback onGallery;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Photo (optional)', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 8),
        if (photo == null)
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: busy ? null : onCamera,
                  icon: const Icon(Icons.camera_alt_outlined),
                  label: const Text('Camera'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: busy ? null : onGallery,
                  icon: const Icon(Icons.photo_library_outlined),
                  label: const Text('Gallery'),
                ),
              ),
            ],
          )
        else
          Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.memory(photo!.bytes, height: 64, width: 64, fit: BoxFit.cover),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(photo!.filename, overflow: TextOverflow.ellipsis)),
              IconButton(
                onPressed: busy ? null : onRemove,
                icon: const Icon(Icons.close),
                tooltip: 'Remove photo',
              ),
            ],
          ),
      ],
    );
  }
}
