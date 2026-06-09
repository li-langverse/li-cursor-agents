# Mint a GitLab PAT for K8s workloads. Invoked only after ensure-k8s-gitlab-pat.*
# confirms the cluster secret token is invalid — never run standalone revoke loops.
#
# ENV (required unless default shown):
#   PAT_NAME          — token name (e.g. gitlab-github-mirror-k8s)
#   PAT_SCOPES        — comma-separated scopes (default: read_api,read_repository)
#   PAT_OUT_FILE      — write plaintext token here (default: /tmp/k8s-gitlab-pat-out)
#
# Revokes same-named tokens, creates one new PAT, writes token to PAT_OUT_FILE.
# Does not patch Kubernetes; the ensure wrapper patches the secret in the same operation.

abort("PAT_NAME required") if ENV["PAT_NAME"].to_s.strip.empty?

user = User.find_by(username: "root") || User.admins.first
abort("no admin user") unless user

name = ENV.fetch("PAT_NAME").strip
scopes = ENV.fetch("PAT_SCOPES", "read_api,read_repository").split(",").map(&:strip)
available = Gitlab::Auth.all_available_scopes.map(&:to_s)
scopes = scopes & available
abort("no valid scopes (wanted #{ENV.fetch('PAT_SCOPES', '')}, available #{available.join(',')})") if scopes.empty?

out_file = ENV.fetch("PAT_OUT_FILE", "/tmp/k8s-gitlab-pat-out")

user.personal_access_tokens.where(name: name).find_each do |t|
  t.revoke! unless t.revoked?
end

token = PersonalAccessToken.new(
  user: user,
  name: name,
  scopes: scopes,
  expires_at: 1.year.from_now
)
token.save!

File.write(out_file, token.token)
$stderr.puts "minted_id=#{token.id} name=#{name} scopes=#{scopes.join(',')}"
