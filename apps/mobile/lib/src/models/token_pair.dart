import 'package:equatable/equatable.dart';

/// Access + refresh token pair returned by `/v1/auth/login` and `/v1/auth/refresh`.
class TokenPair extends Equatable {
  const TokenPair({
    required this.accessToken,
    required this.refreshToken,
    this.expiresIn,
  });

  final String accessToken;
  final String refreshToken;
  final int? expiresIn;

  factory TokenPair.fromJson(Map<String, dynamic> json) => TokenPair(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        expiresIn: json['expiresIn'] as int?,
      );

  @override
  List<Object?> get props => [accessToken, refreshToken, expiresIn];
}
