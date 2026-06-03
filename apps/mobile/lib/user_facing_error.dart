class UserFacingError implements Exception {
  const UserFacingError(this.message);

  final String message;

  @override
  String toString() => message;
}
