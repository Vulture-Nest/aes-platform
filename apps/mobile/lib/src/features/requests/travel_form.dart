import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/travel_repository.dart';
import 'cubit/travel_cubit.dart';

/// Raise a new travel request. Per-diem/advance are computed server-side from the
/// rate table using destination class + grade + days.
class TravelForm extends StatefulWidget {
  const TravelForm({super.key});

  @override
  State<TravelForm> createState() => _TravelFormState();
}

class _TravelFormState extends State<TravelForm> {
  final _formKey = GlobalKey<FormState>();
  final _destination = TextEditingController();
  final _destinationClass = TextEditingController();
  final _grade = TextEditingController();
  String _currency = 'USD';
  DateTimeRange _dates = DateTimeRange(
    start: DateTime.now().add(const Duration(days: 3)),
    end: DateTime.now().add(const Duration(days: 5)),
  );
  bool _busy = false;

  int get _days => _dates.duration.inDays + 1;

  @override
  void dispose() {
    _destination.dispose();
    _destinationClass.dispose();
    _grade.dispose();
    super.dispose();
  }

  Future<void> _pickDates() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      initialDateRange: _dates,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _dates = picked);
  }

  Future<void> _save({required bool submit}) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    final cubit = context.read<TravelCubit>();
    final input = NewTravel(
      destination: _destination.text.trim(),
      dateFrom: _dates.start,
      dateTo: _dates.end,
      days: _days,
      currency: _currency,
      destinationClass: _destinationClass.text.trim(),
      grade: _grade.text.trim(),
    );
    final result = await cubit.create(input, submit: submit);
    if (!mounted) return;
    if (result.ok) {
      Navigator.of(context).pop(
        result.queuedOffline ? 'Saved offline — will sync when connected' : null,
      );
    } else {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.error ?? 'Could not save travel request')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final rangeLabel =
        '${_dates.start.toIso8601String().substring(0, 10)} → ${_dates.end.toIso8601String().substring(0, 10)}  ($_days days)';
    return Scaffold(
      appBar: AppBar(title: const Text('New travel request')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: _destination,
                  enabled: !_busy,
                  decoration: const InputDecoration(labelText: 'Destination'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Where to?' : null,
                ),
                const SizedBox(height: 16),
                InkWell(
                  onTap: _busy ? null : _pickDates,
                  child: InputDecorator(
                    decoration: const InputDecoration(labelText: 'Dates'),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Flexible(child: Text(rangeLabel, overflow: TextOverflow.ellipsis)),
                        const Icon(Icons.date_range, size: 18),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _destinationClass,
                        enabled: !_busy,
                        decoration: const InputDecoration(
                          labelText: 'Class (optional)',
                          hintText: 'e.g. A',
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        controller: _grade,
                        enabled: !_busy,
                        decoration: const InputDecoration(labelText: 'Grade (optional)'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: _currency,
                  decoration: const InputDecoration(labelText: 'Currency'),
                  items: const [
                    DropdownMenuItem(value: 'USD', child: Text('USD')),
                    DropdownMenuItem(value: 'ZWG', child: Text('ZWG')),
                  ],
                  onChanged: _busy ? null : (v) => setState(() => _currency = v ?? 'USD'),
                ),
                const SizedBox(height: 8),
                Text(
                  'The per-diem and advance are calculated from the rate table.',
                  style: Theme.of(context).textTheme.bodySmall,
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
