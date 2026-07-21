import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/petty_cash.dart';
import '../../services/receipt_capture.dart';
import 'cubit/petty_cash_cubit.dart';

/// Raise a petty-cash withdrawal against a float, with an optional receipt.
class WithdrawalForm extends StatefulWidget {
  const WithdrawalForm({super.key, required this.float});

  final PettyCashFloat float;

  @override
  State<WithdrawalForm> createState() => _WithdrawalFormState();
}

class _WithdrawalFormState extends State<WithdrawalForm> {
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _purpose = TextEditingController();
  CapturedReceipt? _receipt;
  bool _busy = false;

  @override
  void dispose() {
    _amount.dispose();
    _purpose.dispose();
    super.dispose();
  }

  Future<void> _capture(bool fromCamera) async {
    final capture = context.read<ReceiptCapture>();
    try {
      final receipt = await capture.capture(fromCamera: fromCamera);
      if (receipt != null && mounted) setState(() => _receipt = receipt);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Could not capture the receipt')));
      }
    }
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    final result = await context.read<PettyCashCubit>().createWithdrawal(
          widget.float.id,
          amount: double.parse(_amount.text),
          purpose: _purpose.text.trim(),
          receipt: _receipt,
        );
    if (!mounted) return;
    if (result.ok) {
      Navigator.of(context).pop(
        result.queuedOffline ? 'Saved offline — will sync when connected' : null,
      );
    } else {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(result.error ?? 'Could not save withdrawal')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Withdraw · ${widget.float.currency}')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: _amount,
                  enabled: !_busy,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    prefixText: '${widget.float.currency} ',
                  ),
                  validator: (v) {
                    final n = double.tryParse(v ?? '');
                    if (n == null || n <= 0) return 'Enter an amount';
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _purpose,
                  enabled: !_busy,
                  minLines: 1,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: 'Purpose'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'What is it for?' : null,
                ),
                const SizedBox(height: 24),
                Text('Receipt (optional)', style: Theme.of(context).textTheme.labelLarge),
                const SizedBox(height: 8),
                if (_receipt == null)
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _busy ? null : () => _capture(true),
                          icon: const Icon(Icons.camera_alt_outlined),
                          label: const Text('Camera'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _busy ? null : () => _capture(false),
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
                        child: Image.memory(_receipt!.bytes, height: 64, width: 64, fit: BoxFit.cover),
                      ),
                      const SizedBox(width: 12),
                      Expanded(child: Text(_receipt!.filename, overflow: TextOverflow.ellipsis)),
                      IconButton(
                        onPressed: _busy ? null : () => setState(() => _receipt = null),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _busy ? null : _save,
                  icon: _busy
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.check),
                  label: const Text('Submit withdrawal'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
