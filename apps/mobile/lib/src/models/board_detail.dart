import 'package:equatable/equatable.dart';

import 'board.dart';

/// A board with its lists, cards, checklist items and comments — the payload of
/// `GET /v1/boards/:id`.
class BoardDetail extends Equatable {
  const BoardDetail({
    required this.id,
    required this.name,
    required this.visibility,
    this.description,
    this.lists = const [],
  });

  final String id;
  final String name;
  final String? description;
  final BoardVisibility visibility;
  final List<BoardList> lists;

  factory BoardDetail.fromJson(Map<String, dynamic> json) {
    final lists = json['lists'] as List<dynamic>?;
    return BoardDetail(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      visibility: BoardVisibility.fromWire(json['visibility']),
      lists: (lists ?? [])
          .map((l) => BoardList.fromJson(l as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  List<Object?> get props => [id, name, description, visibility, lists];
}

/// A column on a board (`board_lists`).
class BoardList extends Equatable {
  const BoardList({
    required this.id,
    required this.name,
    required this.position,
    this.cards = const [],
  });

  final String id;
  final String name;
  final int position;
  final List<BoardCard> cards;

  factory BoardList.fromJson(Map<String, dynamic> json) {
    final cards = json['cards'] as List<dynamic>?;
    return BoardList(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      position: json['position'] as int? ?? 0,
      cards: (cards ?? [])
          .map((c) => BoardCard.fromJson(c as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  List<Object?> get props => [id, name, position, cards];
}

/// A card on a list (`board_cards`), with its checklist + comments.
class BoardCard extends Equatable {
  const BoardCard({
    required this.id,
    required this.listId,
    required this.title,
    required this.position,
    this.description,
    this.assigneeId,
    this.dueDate,
    this.checklistItems = const [],
    this.comments = const [],
  });

  final String id;
  final String listId;
  final String title;
  final String? description;
  final int position;
  final String? assigneeId;
  final DateTime? dueDate;
  final List<ChecklistItem> checklistItems;
  final List<CardComment> comments;

  static DateTime? _date(Object? v) =>
      v == null ? null : DateTime.tryParse(v.toString());

  /// Short `YYYY-MM-DD` due-date label, or null when there is no due date.
  String? get dueLabel => dueDate?.toIso8601String().substring(0, 10);

  int get doneCount => checklistItems.where((i) => i.done).length;

  factory BoardCard.fromJson(Map<String, dynamic> json) {
    final items = json['checklistItems'] as List<dynamic>?;
    final comments = json['comments'] as List<dynamic>?;
    return BoardCard(
      id: json['id'] as String,
      listId: json['listId'] as String? ?? '',
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      position: json['position'] as int? ?? 0,
      assigneeId: json['assigneeId'] as String?,
      dueDate: _date(json['dueDate']),
      checklistItems: (items ?? [])
          .map((i) => ChecklistItem.fromJson(i as Map<String, dynamic>))
          .toList(),
      comments: (comments ?? [])
          .map((c) => CardComment.fromJson(c as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  List<Object?> get props => [
        id,
        listId,
        title,
        description,
        position,
        assigneeId,
        dueDate,
        checklistItems,
        comments,
      ];
}

/// A checklist item on a card (`card_checklist_items`).
class ChecklistItem extends Equatable {
  const ChecklistItem({
    required this.id,
    required this.cardId,
    required this.text,
    required this.done,
    required this.position,
  });

  final String id;
  final String cardId;
  final String text;
  final bool done;
  final int position;

  factory ChecklistItem.fromJson(Map<String, dynamic> json) {
    return ChecklistItem(
      id: json['id'] as String,
      cardId: json['cardId'] as String? ?? '',
      text: json['text'] as String? ?? '',
      done: json['done'] as bool? ?? false,
      position: json['position'] as int? ?? 0,
    );
  }

  @override
  List<Object?> get props => [id, cardId, text, done, position];
}

/// A comment on a card (`card_comments`).
class CardComment extends Equatable {
  const CardComment({
    required this.id,
    required this.cardId,
    required this.body,
    this.authorId,
    this.createdAt,
  });

  final String id;
  final String cardId;
  final String body;
  final String? authorId;
  final DateTime? createdAt;

  factory CardComment.fromJson(Map<String, dynamic> json) {
    return CardComment(
      id: json['id'] as String,
      cardId: json['cardId'] as String? ?? '',
      body: json['body'] as String? ?? '',
      authorId: json['authorId'] as String?,
      createdAt: json['createdAt'] == null
          ? null
          : DateTime.tryParse(json['createdAt'].toString()),
    );
  }

  @override
  List<Object?> get props => [id, cardId, body, authorId, createdAt];
}
