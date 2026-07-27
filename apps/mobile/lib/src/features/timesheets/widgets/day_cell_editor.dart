import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../models/timesheet_entry.dart';

/// One of the five AES man-hour categories, with a compact grid label and colour.
class HourCategory {
  const HourCategory(this.key, this.label, this.short, this.color);

  final String key;
  final String label;
  final String short;
  final Color color;

  static const normal = HourCategory('hoursNormal', 'Normal hours', 'N', Color(0xFF579A34));
  static const ot15 = HourCategory('hoursOt15', 'Overtime @ 1.5×', 'OT1.5', Color(0xFFB7791F));
  static const ot20 = HourCategory('hoursOt20', 'Overtime @ 2.0×', 'OT2', Color(0xFFC0392B));
  static const ug = HourCategory('ugShift', 'Underground shift', 'UG', Color(0xFF6D4C41));
  static const night = HourCategory('nightHours', 'Night hours', 'NGT', Color(0xFF3949AB));

  static const all = [normal, ot15, ot20, ug, night];
}

/// Bottom-sheet editor for a single employee-day cell — the mental model of tapping
/// a day on the AES manhours sheet. Captures the five categories + optional remarks
/// and returns the updated [TimesheetEntry] (or null if dismissed).
class DayCellEditor extends StatefulWidget {
  const DayCellEditor({
    super.key,
    required this.employeeName,
    required this.date,
    required this.entry,
  });

  final String employeeName;
  final DateTime date;
  final TimesheetEntry entry;

  static Future<TimesheetEntry?> show(
    BuildContext context, {
    required String employeeName,
    required DateTime date,
    required TimesheetEntry entry,
  }) {
    return showModalBottomSheet<TimesheetEntry>(
      context: context,
      isScrollControlled: true,
      builder: (_) => DayCellEditor(employeeName: employeeName, date: date, entry: entry),
    );
  }

  @override
  State<DayCellEditor> createState() => _DayCellEditorState();
}

class _DayCellEditorState extends State<DayCellEditor> {
  late final Map<String, TextEditingController> _controllers;
  late final TextEditingController _remarks;

  @override
  void initState() {
    super.initState();
    double v(String key) => switch (key) {
          'hoursNormal' => widget.entry.hoursNormal,
          'hoursOt15' => widget.entry.hoursOt15,
          'hoursOt20' => widget.entry.hoursOt20,
          'ugShift' => widget.entry.ugShift,
          'nightHours' => widget.entry.nightHours,
          _ => 0,
        };
    _controllers = {
      for (final c in HourCategory.all)
        c.key: TextEditingController(text: v(c.key) == 0 ? '' : _fmt(v(c.key))),
    };
    _remarks = TextEditingController(text: widget.entry.remarks ?? '');
  }

  static String _fmt(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toString();

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    _remarks.dispose();
    super.dispose();
  }

  double _read(String key) => double.tryParse(_controllers[key]!.text.trim()) ?? 0;

  void _save() {
    final updated = TimesheetEntry(
      employeeId: widget.entry.employeeId,
      date: widget.date,
      hoursNormal: _read('hoursNormal'),
      hoursOt15: _read('hoursOt15'),
      hoursOt20: _read('hoursOt20'),
      ugShift: _read('ugShift'),
      nightHours: _read('nightHours'),
      remarks: _remarks.text.trim().isEmpty ? null : _remarks.text.trim(),
    );
    Navigator.of(context).pop(updated);
  }

  @override
  Widget build(BuildContext context) {
    final dateLabel =
        '${widget.date.year}-${widget.date.month.toString().padLeft(2, '0')}-${widget.date.day.toString().padLeft(2, '0')}';
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
            Text(widget.employeeName, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 2),
            Text(dateLabel, style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 16),
            for (final c in HourCategory.all) ...[
              _HourField(category: c, controller: _controllers[c.key]!),
              const SizedBox(height: 12),
            ],
            TextField(
              controller: _remarks,
              decoration: const InputDecoration(labelText: 'Remarks (optional)'),
              minLines: 1,
              maxLines: 2,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _save,
              icon: const Icon(Icons.check),
              label: const Text('Save day'),
            ),
          ],
        ),
      ),
    );
  }
}

class _HourField extends StatelessWidget {
  const _HourField({required this.category, required this.controller});

  final HourCategory category;
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: category.color.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            category.short,
            style: TextStyle(color: category.color, fontWeight: FontWeight.w700, fontSize: 11),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(category.label)),
        SizedBox(
          width: 96,
          child: TextField(
            controller: controller,
            textAlign: TextAlign.center,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
            decoration: const InputDecoration(hintText: '0', isDense: true),
          ),
        ),
      ],
    );
  }
}
