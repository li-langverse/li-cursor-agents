# Create or reuse PAT for K8s goal workers (GitLab-primary git).
user = User.find_by(username: "root") || User.admins.first
abort("no admin user") unless user

name = "k8s-goal-worker-git"
scopes = %w[api read_repository write_repository]
available = Gitlab::Auth.all_available_scopes.map(&:to_s)
scopes = scopes & available

user.personal_access_tokens.where(name: name).find_each(&:revoke!)
token = PersonalAccessToken.new(
  user: user,
  name: name,
  scopes: scopes,
  expires_at: 1.year.from_now
)
token.save!

puts token.token
