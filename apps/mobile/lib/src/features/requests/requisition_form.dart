import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/requisitions_repository.dart';
import '../../services/receipt_capture.dart';
import 'cubit/requisitions_cubit.dart';

/// Raise a new cash requisition, optionally attaching a camera/gallery receipt.
class RequisitionForm extends StatefulWidget {
  const RequisitionForm({super.key});

  @override
  State<RequisitionForm> createState() => _RequisitionFormState();
}

class _RequisitionFormState extends State<RequisitionForm> {
  final _formKey = GlobalKey<FormState>();
  final _purpose = TextEditingController();
  final _amount = TextEditingController();
  String _currency = 'USD';
  DateTime _requiredBy = DateTime.now().add(const Duration(days: 7));
  CapturedReceipt? _receipt;
  bool _busy = false;

  @override
  void dispose() {
    _purpose.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _requiredBy,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _requiredBy = picked);
  }

  Future<void> _captureReceipt(bool fromCamera) async {
    final capture = context.read<ReceiptCapture>();
    try {
      final receipt = await capture.capture(fromCamera: fromCamera);
      if (receipt != null && mounted) setState(() => _receipt = receipt);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not capture the receipt')),
        );
      }
    }
  }

  Future<void> _save({required bool submit}) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    final cubit = context.read<RequisitionsCubit>();
    final input = NewRequisition(
      purpose: _purpose.text.trim(),
      amount: double.parse(_amount.text),
      currency: _currency,
      requiredByDate: _requiredBy,
    );
    final result = await cubit.create(input, receipt: _receipt, submit: submit);
    if (!mounted) return;
    if (result.ok) {
      Navigator.of(context).pop(
        result.queuedOffline ? 'Saved offline — will sync when connected' : null,
      );
    } else {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.error ?? 'Could not save requisition')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateLabel = _requiredBy.toIso8601String().substring(0, 10);
    return Scaffold(
      appBar: AppBar(title: const Text('New requisition')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: _purpose,
                  enabled: !_busy,
                  decoration: const InputDecoration(labelText: 'Purpose'),
                  minLines: 1,
                  maxLines: 3,
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Describe what this is for' : null,
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _amount,
                        enabled: !_busy,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(labelText: 'Amount'),
                        validator: (v) {
                          final n = double.tryParse(v ?? '');
                          if (n == null || n <= 0) return 'Enter an amount';
                          return null;
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    SizedBox(
                      width: 110,
                      child: DropdownButtonFormField<String>(
                        initialValue: _currency,
                        decoration: const InputDecoration(labelText: 'Currency'),
                        items: const [
                          DropdownMenuItem(value: 'USD', child: Text('USD')),
                          DropdownMenuItem(value: 'ZWG', child: Text('ZWG')),
                        ],
                        onChanged: _busy ? null : (v) => setState(() => _currency = v ?? 'USD'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                InkWell(
                  onTap: _busy ? null : _pickDate,
                  child: InputDecorator(
                    decoration: const InputDecoration(labelText: 'Required by'),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [Text(dateLabel), const Icon(Icons.calendar_today, size: 18)],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                _ReceiptField(
                  receipt: _receipt,
                  busy: _busy,
                  onCamera: () => _captureReceipt(true),
                  onGallery: () => _captureReceipt(false),
                  onRemove: () => setState(() => _receipt = null),
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _busy ? null : () => _save(submit: true),
                  icon: _busy
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.send),
                  label: const Text('Save & submit'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: _busy ? null : () => _save(submit: false),
                  child: const Text('Save as draft'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Receipt capture row: buttons to attach from camera/gallery + a thumbnail once set.
class _ReceiptField extends StatelessWidget {
  const _ReceiptField({
    required this.receipt,
    required this.busy,
    required this.onCamera,
    required this.onGallery,
    required this.onRemove,
  });

  final CapturedReceipt? receipt;
  final bool busy;
  final VoidCallback onCamera;
  final VoidCallback onGallery;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Receipt (optional)', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 8),
        if (receipt == null)
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
                child: Image.memory(receipt!.bytes, height: 64, width: 64, fit: BoxFit.cover),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(receipt!.filename, overflow: TextOverflow.ellipsis)),
              IconButton(
                onPressed: busy ? null : onRemove,
                icon: const Icon(Icons.close),
                tooltip: 'Remove receipt',
              ),
            ],
          ),
      ],
    );
  }
}
