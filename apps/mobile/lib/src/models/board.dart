import 'package:equatable/equatable.dart';

/// Board visibility. Confidentiality is enforced SERVER-SIDE — the app renders
/// whatever `/v1/boards` returns and only styles the chip accordingly.
enum BoardVisibility {
  team('TEAM', 'Team'),
  directorConfidential('DIRECTOR_CONFIDENTIAL', 'Director-confidential');

  const BoardVisibility(this.wire, this.label);

  /// The value the API sends/expects.
  final String wire;

  /// Human-readable chip label.
  final String label;

  bool get isConfidential => this == BoardVisibility.directorConfidential;

  static BoardVisibility fromWire(Object? value) {
    return BoardVisibility.values.firstWhere(
      (v) => v.wire == value,
      orElse: () => BoardVisibility.team,
    );
  }
}

/// A director-confidential-capable board (`/v1/boards`). The list response
/// carries metadata + members; lists/cards are loaded on demand via the board
/// detail endpoint (see [BoardDetail]).
class Board extends Equatable {
  const Board({
    required this.id,
    required this.name,
    required this.visibility,
    this.description,
    this.memberCount = 0,
  });

  final String id;
  final String name;
  final String? description;
  final BoardVisibility visibility;
  final int memberCount;

  factory Board.fromJson(Map<String, dynamic> json) {
    final members = json['members'] as List<dynamic>?;
    return Board(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      visibility: BoardVisibility.fromWire(json['visibility']),
      memberCount: members?.length ?? 0,
    );
  }

  @override
  List<Object?> get props => [id, name, description, visibility, memberCount];
}
