part of 'qr_home_page.dart';

class MobileProfile {
  const MobileProfile({
    required this.username,
    required this.login,
    required this.email,
    required this.firstName,
    required this.lastName,
    required this.phoneNumber,
    required this.avatarUrl,
    required this.role,
    required this.status,
  });

  final String username;
  final String login;
  final String email;
  final String firstName;
  final String lastName;
  final String phoneNumber;
  final String avatarUrl;
  final String role;
  final String status;

  String get displayName {
    final String fullName = '$firstName $lastName'.trim();
    if (fullName.isNotEmpty) {
      return fullName;
    }
    final String normalizedUsername = username.trim();
    if (normalizedUsername.isNotEmpty) {
      return normalizedUsername;
    }
    return login.trim();
  }

  String get profileUsername {
    final String normalizedUsername = username.trim();
    return normalizedUsername.isNotEmpty ? normalizedUsername : login.trim();
  }

  factory MobileProfile.fromJson(Map<String, dynamic> json) {
    return MobileProfile(
      username: '${json['username'] ?? json['user_name'] ?? ''}'.trim(),
      login: '${json['login'] ?? ''}'.trim(),
      email: '${json['email'] ?? json['mail'] ?? ''}'.trim(),
      firstName: '${json['first_name'] ?? ''}'.trim(),
      lastName: '${json['last_name'] ?? ''}'.trim(),
      phoneNumber: '${json['phone_number'] ?? json['phone'] ?? ''}'.trim(),
      avatarUrl: '${json['avatar_url'] ?? ''}'.trim(),
      role: '${json['role'] ?? ''}'.trim(),
      status: '${json['status'] ?? ''}'.trim(),
    );
  }

  factory MobileProfile.fromSettings(AppSettings settings) {
    return MobileProfile(
      username: settings.username,
      login: settings.login,
      email: settings.email,
      firstName: settings.firstName,
      lastName: settings.lastName,
      phoneNumber: settings.phoneNumber,
      avatarUrl: settings.avatarUrl,
      role: settings.role,
      status: settings.status,
    );
  }
}

class MobileProfileTab extends StatefulWidget {
  const MobileProfileTab({
    super.key,
    this.topChildren = const <Widget>[],
    required this.onLogout,
    required this.onCheckUpdates,
    required this.onUpdateApp,
    required this.updateAvailable,
    required this.checkingUpdates,
  });

  final List<Widget> topChildren;
  final Future<void> Function() onLogout;
  final Future<void> Function() onCheckUpdates;
  final Future<void> Function() onUpdateApp;
  final bool updateAvailable;
  final bool checkingUpdates;

  @override
  State<MobileProfileTab> createState() => _MobileProfileTabState();
}

class _MobileProfileTabState extends State<MobileProfileTab> {
  static const double _profileSectionGap = 8;
  static const double _profileItemGap = 10;
  static const double _profileActionGap = 14;
  static const EdgeInsets _profileSurfacePadding = EdgeInsets.symmetric(
    horizontal: 16,
    vertical: 12,
  );

  final ImagePicker _imagePicker = ImagePicker();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _firstNameController = TextEditingController();
  final TextEditingController _lastNameController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _currentPasswordController =
      TextEditingController();
  final TextEditingController _newPasswordController = TextEditingController();
  final TextEditingController _confirmPasswordController =
      TextEditingController();

  bool _loading = true;
  bool _saving = false;
  bool _uploadingAvatar = false;
  bool _changingPassword = false;
  bool _initializedFromSettings = false;
  bool _profileLoadStarted = false;
  MobileProfile? _profile;
  String? _statusMessage;
  String? _errorMessage;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initializedFromSettings) {
      _initializedFromSettings = true;
      final MobileProfile localProfile = MobileProfile.fromSettings(_settings);
      _profile = localProfile;
      _emailController.text = localProfile.email;
      _firstNameController.text = localProfile.firstName;
      _lastNameController.text = localProfile.lastName;
      _phoneController.text = localProfile.phoneNumber;
    }
    if (!_profileLoadStarted) {
      _profileLoadStarted = true;
      unawaited(_loadProfile());
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _firstNameController.dispose();
    _lastNameController.dispose();
    _phoneController.dispose();
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  AppSettings get _settings => AppSettingsScope.of(context);

  String get _apiBase => normalizeApiBase(_settings.apiBaseUrl);

  Map<String, String> get _jsonHeaders => const <String, String>{
        'Content-Type': 'application/json',
      };

  Future<void> _loadProfile() async {
    if (!mounted) {
      return;
    }
    setState(() {
      _loading = true;
      _errorMessage = null;
    });
    try {
      final http.Response response = await mobileAuthorizedRequest(
        _settings,
        'GET',
        Uri.parse('$_apiBase/auth/me'),
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw UserFacingError(_extractApiMessage(
          response,
          'Profile request failed: HTTP ${response.statusCode}',
        ));
      }
      final dynamic decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        throw const UserFacingError('Profile response is invalid.');
      }
      final MobileProfile profile = MobileProfile.fromJson(decoded);
      if (!mounted) {
        return;
      }
      setState(() {
        _profile = profile;
        _emailController.text = profile.email;
        _firstNameController.text = profile.firstName;
        _lastNameController.text = profile.lastName;
        _phoneController.text = profile.phoneNumber;
      });
      await _settings.updateProfile(
        login: profile.login,
        username: profile.username,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        phoneNumber: profile.phoneNumber,
        avatarUrl: profile.avatarUrl,
        role: profile.role,
        status: profile.status,
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _errorMessage = AppStrings.of(context).format(
          'profile_load_failed',
          <String, String>{'error': '$error'},
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _saveProfile() async {
    if (_saving) {
      return;
    }
    final AppStrings strings = AppStrings.of(context);
    setState(() {
      _saving = true;
      _statusMessage = null;
      _errorMessage = null;
    });
    try {
      final Map<String, dynamic> payload = <String, dynamic>{
        'email': _emailController.text.trim(),
      };
      final String firstName = _firstNameController.text.trim();
      final String lastName = _lastNameController.text.trim();
      final String phoneNumber = _phoneController.text.trim();
      payload['first_name'] = firstName;
      payload['last_name'] = lastName;
      payload['phone_number'] = phoneNumber;
      final http.Response response = await mobileAuthorizedRequest(
        _settings,
        'PATCH',
        Uri.parse('$_apiBase/auth/me'),
        headers: _jsonHeaders,
        body: jsonEncode(payload),
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw UserFacingError(_extractApiMessage(
          response,
          'Profile update failed: HTTP ${response.statusCode}',
        ));
      }
      final dynamic decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        throw const UserFacingError('Profile response is invalid.');
      }
      final MobileProfile profile = MobileProfile.fromJson(decoded);
      await _settings.updateProfile(
        login: profile.login,
        username: profile.username,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        phoneNumber: profile.phoneNumber,
        avatarUrl: profile.avatarUrl,
        role: profile.role,
        status: profile.status,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _profile = profile;
        _emailController.text = profile.email;
        _firstNameController.text = profile.firstName;
        _lastNameController.text = profile.lastName;
        _phoneController.text = profile.phoneNumber;
        _statusMessage = strings.text('profile_updated');
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _errorMessage = strings.format(
          'profile_update_failed',
          <String, String>{'error': '$error'},
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  Future<void> _pickAndUploadAvatar() async {
    if (_uploadingAvatar) {
      return;
    }
    final AppStrings strings = AppStrings.of(context);
    final XFile? image = await _imagePicker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 88,
      maxWidth: 1200,
    );
    if (image == null) {
      return;
    }
    setState(() {
      _uploadingAvatar = true;
      _statusMessage = null;
      _errorMessage = null;
    });
    try {
      final String avatarUrl = await _uploadAvatar(image);
      final http.Response response = await mobileAuthorizedRequest(
        _settings,
        'PATCH',
        Uri.parse('$_apiBase/auth/me'),
        headers: _jsonHeaders,
        body: jsonEncode(<String, dynamic>{'avatar_url': avatarUrl}),
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw UserFacingError(_extractApiMessage(
          response,
          'Avatar update failed: HTTP ${response.statusCode}',
        ));
      }
      final dynamic decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        throw const UserFacingError('Profile response is invalid.');
      }
      final MobileProfile profile = MobileProfile.fromJson(decoded);
      await _settings.updateProfile(
        login: profile.login,
        username: profile.username,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        phoneNumber: profile.phoneNumber,
        avatarUrl: profile.avatarUrl,
        role: profile.role,
        status: profile.status,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _profile = profile;
        _statusMessage = strings.text('avatar_uploaded');
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _errorMessage = '$error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _uploadingAvatar = false;
        });
      }
    }
  }

  Future<String> _uploadAvatar(XFile file) async {
    final Uri url = Uri.parse('$_apiBase/uploads')
        .replace(queryParameters: <String, String>{'kind': 'avatar'});
    Future<http.StreamedResponse> sendOnce() async {
      final http.MultipartRequest request = http.MultipartRequest('POST', url);
      final String token = _settings.authToken.trim();
      if (token.isNotEmpty) {
        request.headers['Authorization'] = 'Bearer $token';
      }
      request.files.add(await http.MultipartFile.fromPath('file', file.path));
      return request.send();
    }

    http.StreamedResponse streamed = await sendOnce();
    if (streamed.statusCode == 401 &&
        await refreshMobileAuthSession(_settings, apiBase: _apiBase)) {
      await streamed.stream.drain<void>();
      streamed = await sendOnce();
    }
    final String body = await streamed.stream.bytesToString();
    if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
      throw UserFacingError(
          'Avatar upload failed: HTTP ${streamed.statusCode}');
    }
    final dynamic decoded = jsonDecode(body);
    if (decoded is! Map<String, dynamic>) {
      throw const UserFacingError('Avatar upload response is invalid.');
    }
    final String rawUrl = '${decoded['url'] ?? ''}'.trim();
    if (rawUrl.isEmpty) {
      throw const UserFacingError('Avatar upload returned empty URL.');
    }
    return rawUrl;
  }

  Future<void> _changePassword() async {
    if (_changingPassword) {
      return;
    }
    final AppStrings strings = AppStrings.of(context);
    final String currentPassword = _currentPasswordController.text;
    final String newPassword = _newPasswordController.text;
    final String confirmPassword = _confirmPasswordController.text;
    if (newPassword != confirmPassword) {
      setState(() {
        _errorMessage = 'New password confirmation does not match.';
      });
      return;
    }
    setState(() {
      _changingPassword = true;
      _statusMessage = null;
      _errorMessage = null;
    });
    try {
      final http.Response response = await mobileAuthorizedRequest(
        _settings,
        'POST',
        Uri.parse('$_apiBase/auth/me/password'),
        headers: _jsonHeaders,
        body: jsonEncode(<String, String>{
          'current_password': currentPassword,
          'new_password': newPassword,
        }),
        retryOnUnauthorized: false,
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw UserFacingError(_extractApiMessage(
          response,
          'Password change failed: HTTP ${response.statusCode}',
        ));
      }
      await _settings.clearSession();
      configureMobileLogAuthToken('');
      if (!mounted) {
        return;
      }
      Navigator.of(context).pushNamedAndRemoveUntil('/login', (_) => false);
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _errorMessage = strings.format(
          'password_change_failed',
          <String, String>{'error': '$error'},
        );
      });
    } finally {
      if (mounted) {
        setState(() {
          _changingPassword = false;
        });
      }
    }
  }

  String _extractApiMessage(http.Response response, String fallback) {
    try {
      final dynamic decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) {
        final dynamic message = decoded['message'] ?? decoded['detail'];
        if (message is String && message.trim().isNotEmpty) {
          return message.trim();
        }
      }
    } catch (_) {}
    return fallback;
  }

  String _resolveAvatarUrl(String rawUrl) {
    final String trimmed = rawUrl.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    if (!trimmed.startsWith('/')) {
      return trimmed;
    }
    return Uri.parse(_apiBase).resolve(trimmed).toString();
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings strings = AppStrings.of(context);
    final AppSettings settings = AppSettingsScope.of(context);
    final MobileProfile profile =
        _profile ?? MobileProfile.fromSettings(settings);
    final String avatarUrl = profile.avatarUrl;
    final String displayName = _profileDisplayName(profile);
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
      child: Container(
        decoration: const BoxDecoration(gradient: appBackgroundGradient),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 30),
          children: <Widget>[
            ...widget.topChildren,
            AppSurface(
              padding: _profileSurfacePadding,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      GestureDetector(
                        onTap: _uploadingAvatar ? null : _pickAndUploadAvatar,
                        child: Stack(
                          alignment: Alignment.bottomRight,
                          children: <Widget>[
                            Container(
                              width: 72,
                              height: 72,
                              clipBehavior: Clip.antiAlias,
                              decoration: BoxDecoration(
                                color: uiCardSoft,
                                borderRadius: BorderRadius.circular(22),
                              ),
                              child: avatarUrl.trim().isEmpty
                                  ? const Icon(
                                      Icons.person_rounded,
                                      color: uiMuted,
                                      size: 38,
                                    )
                                  : Image.network(
                                      _resolveAvatarUrl(avatarUrl),
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => const Icon(
                                        Icons.person_rounded,
                                        color: uiMuted,
                                        size: 38,
                                      ),
                                    ),
                            ),
                            Container(
                              width: 28,
                              height: 28,
                              decoration: BoxDecoration(
                                color: uiGreen,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: _uploadingAvatar
                                  ? const Padding(
                                      padding: EdgeInsets.all(6),
                                      child: AppLoadingIndicator(
                                          color: Colors.white),
                                    )
                                  : const Icon(
                                      Icons.photo_camera_rounded,
                                      size: 16,
                                      color: Colors.white,
                                    ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: _profileItemGap),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(
                              displayName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style:
                                  AuthTextStyles.title.copyWith(fontSize: 24),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _profileSubtitle(profile, settings, strings),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AuthTextStyles.helper,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (_loading) ...<Widget>[
                    const SizedBox(height: _profileItemGap),
                    const Center(child: AppLoadingIndicator()),
                  ],
                  if ((_statusMessage ?? '').trim().isNotEmpty) ...<Widget>[
                    const SizedBox(height: _profileItemGap),
                    _ProfileMessage(text: _statusMessage!, error: false),
                  ],
                  if ((_errorMessage ?? '').trim().isNotEmpty) ...<Widget>[
                    const SizedBox(height: _profileItemGap),
                    _ProfileMessage(text: _errorMessage!, error: true),
                  ],
                ],
              ),
            ),
            const SizedBox(height: _profileSectionGap),
            AppSurface(
              padding: _profileSurfacePadding,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: _ProfileFact(
                          label: strings.text('login_value'),
                          value: profile.login,
                        ),
                      ),
                      const SizedBox(width: _profileItemGap),
                      Expanded(
                        child: _ProfileFact(
                          label: strings.text('profile_status'),
                          value: strings.profileStatusLabel(profile.status),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: _profileItemGap),
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: _ProfileFact(
                          label: strings.text('profile_role'),
                          value: strings.profileRoleLabel(profile.role),
                        ),
                      ),
                      const SizedBox(width: _profileItemGap),
                      Expanded(
                        child: _ProfileFact(
                          label: strings.text('profile_user'),
                          value: profile.profileUsername,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: _profileSectionGap),
            AppSurface(
              padding: _profileSurfacePadding,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  AppInputField(
                    controller: _emailController,
                    label: strings.text('email_value'),
                    keyboardType: TextInputType.emailAddress,
                  ),
                  const SizedBox(height: _profileItemGap),
                  AppInputField(
                    controller: _firstNameController,
                    label: strings.text('first_name'),
                  ),
                  const SizedBox(height: _profileItemGap),
                  AppInputField(
                    controller: _lastNameController,
                    label: strings.text('last_name'),
                  ),
                  const SizedBox(height: _profileItemGap),
                  AppInputField(
                    controller: _phoneController,
                    label: strings.text('phone_number'),
                    keyboardType: TextInputType.phone,
                  ),
                  const SizedBox(height: _profileItemGap),
                  AppReadonlyField(
                    label: strings.text('profile_username'),
                    value: profile.profileUsername,
                  ),
                  const SizedBox(height: _profileItemGap),
                  AppReadonlyField(
                    label: strings.text('profile_role'),
                    value: strings.profileRoleLabel(profile.role),
                  ),
                  const SizedBox(height: _profileActionGap),
                  AppPrimaryButton(
                    label: strings.text('save_profile'),
                    icon: Icons.save_rounded,
                    backgroundColor: uiBrandGreen,
                    loading: _saving,
                    onPressed: _loading ? null : _saveProfile,
                  ),
                ],
              ),
            ),
            const SizedBox(height: _profileSectionGap),
            AppSurface(
              padding: _profileSurfacePadding,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Text(
                    strings.text('change_password'),
                    style: AuthTextStyles.title.copyWith(fontSize: 20),
                  ),
                  const SizedBox(height: _profileItemGap),
                  AppInputField(
                    controller: _currentPasswordController,
                    label: strings.text('current_password'),
                    obscureText: true,
                  ),
                  const SizedBox(height: _profileItemGap),
                  AppInputField(
                    controller: _newPasswordController,
                    label: strings.text('new_password'),
                    obscureText: true,
                  ),
                  const SizedBox(height: _profileItemGap),
                  AppInputField(
                    controller: _confirmPasswordController,
                    label: strings.text('confirm_password'),
                    obscureText: true,
                  ),
                  const SizedBox(height: _profileActionGap),
                  AppPrimaryButton(
                    label: strings.text('change_password'),
                    icon: Icons.lock_reset_rounded,
                    backgroundColor: uiBrandGreen,
                    loading: _changingPassword,
                    onPressed: _changePassword,
                  ),
                ],
              ),
            ),
            const SizedBox(height: _profileSectionGap),
            AppSurface(
              padding: _profileSurfacePadding,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Text(
                    strings.text('settings'),
                    style: AuthTextStyles.title.copyWith(fontSize: 20),
                  ),
                  const SizedBox(height: _profileItemGap),
                  AppActionTile(
                    icon: Icons.system_update_alt_rounded,
                    title: widget.updateAvailable
                        ? strings.text('update_available')
                        : strings.text('check_updates'),
                    enabled: !widget.checkingUpdates,
                    onTap: widget.onCheckUpdates,
                  ),
                  if (widget.updateAvailable) ...<Widget>[
                    const SizedBox(height: _profileItemGap),
                    AppActionTile(
                      icon: Icons.download_for_offline_rounded,
                      title: strings.text('update_app'),
                      onTap: widget.onUpdateApp,
                    ),
                  ],
                  const SizedBox(height: _profileActionGap),
                  AppPrimaryButton(
                    label: strings.text('logout'),
                    icon: Icons.logout_rounded,
                    destructive: true,
                    onPressed: widget.onLogout,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _profileDisplayName(MobileProfile profile) {
  return profile.displayName.isNotEmpty ? profile.displayName : '-';
}

String _profileSubtitle(
  MobileProfile? profile,
  AppSettings settings,
  AppStrings strings,
) {
  final MobileProfile effectiveProfile =
      profile ?? MobileProfile.fromSettings(settings);
  final List<String> parts = <String>[
    strings.profileRoleLabel(effectiveProfile.role),
    strings.profileStatusLabel(effectiveProfile.status),
  ].where((String value) => value.isNotEmpty).toList(growable: false);
  return parts.isEmpty ? '-' : parts.join(' / ');
}

class _ProfileMessage extends StatelessWidget {
  const _ProfileMessage({
    required this.text,
    required this.error,
  });

  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: error
            ? AuthColors.destructive.withValues(alpha: 0.10)
            : uiBrandGreenSoft,
        borderRadius: BorderRadius.circular(AuthRadii.md),
      ),
      child: Text(
        text,
        style: AuthTextStyles.helper.copyWith(
          color: error ? AuthColors.destructive : uiText,
        ),
      ),
    );
  }
}

class _ProfileFact extends StatelessWidget {
  const _ProfileFact({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final String normalized = value.trim().isEmpty ? '-' : value.trim();
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: uiCardSoft,
        borderRadius: BorderRadius.circular(AuthRadii.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            label.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AuthTextStyles.helper.copyWith(
              fontSize: 10,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            normalized,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AuthTextStyles.language.copyWith(fontSize: 14),
          ),
        ],
      ),
    );
  }
}

class AppReadonlyField extends StatelessWidget {
  const AppReadonlyField({
    super.key,
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final String normalized = value.trim().isEmpty ? '-' : value.trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(label, style: AuthTextStyles.label),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(
            horizontal: AuthSpacing.md,
            vertical: AuthSpacing.md,
          ),
          decoration: BoxDecoration(
            color: uiCardSoft,
            borderRadius: BorderRadius.circular(AuthRadii.md),
          ),
          child: Text(
            normalized,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AuthTextStyles.input.copyWith(
              color: AuthColors.mutedForeground,
            ),
          ),
        ),
      ],
    );
  }
}
