// src/action-entry.ts
import { appendFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// src/errors.ts
var ReviewerError = class extends Error {
  /** @param code Stable machine-readable failure code. @param message Safe diagnostic. */
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ReviewerError";
  }
  code;
};
function errorCode(error) {
  return error instanceof ReviewerError ? error.code : "UNEXPECTED_ERROR";
}

// src/http.ts
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ReviewerError("INVALID_RESPONSE", "Expected an API object.");
  return value;
}
function array(value) {
  if (!Array.isArray(value))
    throw new ReviewerError("INVALID_RESPONSE", "Expected an API array.");
  return value;
}
function string(value) {
  if (typeof value !== "string")
    throw new ReviewerError("INVALID_RESPONSE", "Expected an API string.");
  return value;
}
function id(value) {
  if (typeof value !== "string" && (typeof value !== "number" || !Number.isSafeInteger(value)))
    throw new ReviewerError("INVALID_RESPONSE", "Expected an API identifier.");
  return String(value);
}
function number(value) {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new ReviewerError("INVALID_RESPONSE", "Expected an API number.");
  return value;
}
var HttpClient = class {
  /** @param apiUrl API root. @param options Request policy. @param headers Authentication headers. */
  constructor(apiUrl, options, headers) {
    this.options = options;
    this.headers = headers;
    try {
      this.base = new URL(apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`);
    } catch {
      throw new ReviewerError("INVALID_OPTIONS", "Invalid API URL.");
    }
    if (this.base.protocol !== "https:" || this.base.username || this.base.password || this.base.search || this.base.hash)
      throw new ReviewerError(
        "INVALID_OPTIONS",
        "API URL must be an HTTPS URL without credentials, query, or fragment."
      );
    if (!options.token.trim())
      throw new ReviewerError(
        "INVALID_OPTIONS",
        "A provider token is required."
      );
    this.fetcher = options.fetch ?? fetch;
    this.concurrency = options.concurrency ?? 5;
    for (const [key, value, min] of [
      ["concurrency", this.concurrency, 1],
      ["timeoutMs", options.timeoutMs ?? 15e3, 1],
      ["retries", options.retries ?? 2, 0],
      ["maxPages", options.maxPages ?? 100, 1]
    ]) {
      if (!Number.isInteger(value) || value < min)
        throw new ReviewerError("INVALID_OPTIONS", `${key} is invalid.`);
    }
  }
  options;
  headers;
  base;
  fetcher;
  concurrency;
  active = 0;
  waiting = [];
  async slot(run) {
    if (this.active >= this.concurrency)
      await new Promise((resolve) => this.waiting.push(resolve));
    else this.active++;
    try {
      return await run();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
  /** Send a JSON request; null represents a missing optional resource only. */
  async request(path, query = {}, method = "GET", body, optional = false) {
    const url = new URL(path, this.base);
    if (url.origin !== this.base.origin || !url.pathname.startsWith(this.base.pathname))
      throw new ReviewerError(
        "INVALID_OPTIONS",
        "API path escapes configured root."
      );
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, String(value));
    const retries = method === "GET" ? this.options.retries ?? 2 : 0;
    for (let attempt = 0; ; attempt++) {
      this.options.signal?.throwIfAborted();
      const response = await this.slot(async () => {
        const signal = AbortSignal.any([
          AbortSignal.timeout(this.options.timeoutMs ?? 15e3),
          ...this.options.signal ? [this.options.signal] : []
        ]);
        try {
          return await this.fetcher(url, {
            method,
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              ...this.headers
            },
            signal,
            redirect: "error",
            ...body === void 0 ? {} : { body: JSON.stringify(body) }
          });
        } catch {
          throw new ReviewerError(
            this.options.signal?.aborted ? "CANCELLED" : "NETWORK_ERROR",
            "Provider request failed or timed out."
          );
        }
      });
      if (optional && response.status === 404) return null;
      const rateLimited = response.status === 429 || response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after"));
      if (!response.ok) {
        if ((rateLimited || response.status >= 500) && attempt < retries) {
          const retry = response.headers.get("retry-after");
          const reset = response.headers.get("x-ratelimit-reset");
          const delay = retry === null ? reset === null ? 250 * 2 ** attempt : Number(reset) * 1e3 - Date.now() : /^\d+$/.test(retry) ? Number(retry) * 1e3 : Date.parse(retry) - Date.now();
          if (delay > 3e4)
            throw new ReviewerError(
              "RATE_LIMIT",
              "Provider retry window exceeds request budget."
            );
          await new Promise(
            (resolve) => setTimeout(
              resolve,
              Math.max(0, Number.isFinite(delay) ? delay : 250)
            )
          );
          continue;
        }
        throw new ReviewerError(
          rateLimited ? "RATE_LIMIT" : `HTTP_${response.status}`,
          "Provider rejected the request."
        );
      }
      if (response.status === 204)
        return { data: null, headers: response.headers };
      try {
        return {
          data: await response.json(),
          headers: response.headers
        };
      } catch {
        throw new ReviewerError(
          "INVALID_RESPONSE",
          "Provider returned invalid JSON."
        );
      }
    }
  }
  /** Collect paginated arrays, reporting truncation rather than silently losing data. */
  async pages(path, query = {}, limit = Infinity) {
    const result = [];
    const pageSize = Math.min(100, limit);
    for (let page = 1; page <= (this.options.maxPages ?? 100); page++) {
      const response = await this.request(path, {
        ...query,
        per_page: pageSize,
        page
      });
      const values = array(response.data);
      result.push(...values);
      if (result.length >= limit) return result.slice(0, limit);
      const next = response.headers.get("x-next-page");
      const link = response.headers.get("link");
      if (next === "" || next === null && (link !== null ? !link.includes('rel="next"') : values.length < pageSize))
        return result;
    }
    throw new ReviewerError(
      "TRUNCATED",
      "Provider pagination exceeded the configured page budget."
    );
  }
};

// src/ranking.ts
var DEFAULT_WEIGHTS = Object.freeze({
  expertise: 0.45,
  ownership: 0.25,
  recency: 0.15,
  access: 0.1,
  availability: 0.05
});
var defaults = {
  limit: 2,
  minScore: 0.05,
  historyLimit: 30,
  maxReviewLoad: 8,
  halfLifeDays: 30,
  horizonDays: 180,
  fallback: false
};
var keys = Object.keys(DEFAULT_WEIGHTS);
var lower = (value) => value.toLowerCase();
var clamp = (n) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
var compare = (a, b) => Number(a > b) - Number(a < b);
function resolveOptions(options) {
  const result = {
    ...defaults,
    ...options,
    now: options.now ?? (/* @__PURE__ */ new Date()).toISOString(),
    exclude: options.exclude ?? [],
    aliases: options.aliases ?? {},
    weights: { ...DEFAULT_WEIGHTS, ...options.weights }
  };
  for (const key of ["limit", "historyLimit", "maxReviewLoad"]) {
    if (!Number.isInteger(result[key]) || result[key] < (key === "limit" ? 0 : 1))
      throw new ReviewerError(
        "INVALID_OPTIONS",
        `${key} must be a valid nonnegative count.`
      );
  }
  for (const key of ["minScore", "halfLifeDays", "horizonDays"]) {
    if (!Number.isFinite(result[key]) || result[key] < 0 || key !== "minScore" && result[key] === 0)
      throw new ReviewerError("INVALID_OPTIONS", `${key} is out of range.`);
  }
  if (result.minScore > 1 || !Number.isFinite(Date.parse(result.now)) || typeof result.fallback !== "boolean" || !Array.isArray(result.exclude) || !result.exclude.every((x) => typeof x === "string") || typeof result.aliases !== "object" || Array.isArray(result.aliases) || !Object.values(result.aliases).every((x) => typeof x === "string"))
    throw new ReviewerError("INVALID_OPTIONS", "Invalid ranking options.");
  if (keys.some(
    (key) => !Number.isFinite(result.weights[key]) || result.weights[key] < 0
  ) || Math.abs(keys.reduce((n, key) => n + result.weights[key], 0) - 1) > 1e-9)
    throw new ReviewerError(
      "INVALID_OPTIONS",
      "Weights must be nonnegative and sum to one."
    );
  return result;
}
function authorResolver(members, aliases) {
  const emails = /* @__PURE__ */ new Map();
  for (const member of members)
    for (const email of member.emails) {
      const key = lower(email);
      const owners = emails.get(key) ?? /* @__PURE__ */ new Set();
      owners.add(lower(member.username));
      emails.set(key, owners);
    }
  for (const [email, username] of Object.entries(aliases))
    emails.set(lower(email), /* @__PURE__ */ new Set([lower(username)]));
  return (commit) => {
    if (commit.username) return lower(commit.username);
    const owners = emails.get(lower(commit.email ?? ""));
    return owners?.size === 1 ? [...owners][0] : void 0;
  };
}
function rankReviewers(snapshot, options = {}) {
  const opts = resolveOptions(options);
  const forbidden = new Set(
    [
      snapshot.context.author,
      ...snapshot.context.existingReviewers.map((m) => m.username),
      ...opts.exclude
    ].map(lower)
  );
  const members = [
    ...new Map(snapshot.members.map((member) => [member.id, member])).values()
  ];
  const resolveAuthor = authorResolver(members, opts.aliases);
  const files = [
    ...new Map(snapshot.files.map((file) => [file.path, file])).values()
  ];
  const now = Date.parse(opts.now);
  const scored = members.filter(
    (m) => m.active && !m.bot && m.access >= 0.6 && !forbidden.has(lower(m.username))
  ).map((member) => {
    const username = lower(member.username);
    let expertise = 0;
    let recency = 0;
    const contributedFiles = [];
    const ownedFiles = [];
    for (const file of files) {
      const commits = [
        ...new Map(
          file.contributions.filter((c) => resolveAuthor(c) === username).map((c) => [c.sha, c])
        ).values()
      ];
      if (commits.length) contributedFiles.push(file.path);
      expertise += Math.log1p(Math.min(commits.length, opts.historyLimit)) / Math.log1p(opts.historyLimit);
      const dates = commits.map((c) => Date.parse(c.date)).filter(Number.isFinite);
      if (dates.length) {
        const age = Math.max(0, (now - Math.max(...dates)) / 864e5);
        if (age <= opts.horizonDays)
          recency += 2 ** (-age / opts.halfLifeDays);
      }
      if (file.owners.some((owner) => lower(owner) === username))
        ownedFiles.push(file.path);
    }
    const load = snapshot.loads[username];
    const breakdown = {
      expertise: expertise / (files.length || 1),
      ownership: ownedFiles.length / (files.length || 1),
      recency: recency / (files.length || 1),
      access: clamp(member.access),
      availability: load === void 0 || !Number.isFinite(load) || load < 0 ? 0 : clamp(1 - load / opts.maxReviewLoad)
    };
    return {
      provider: member.provider,
      host: member.host,
      id: member.id,
      username: member.username,
      score: clamp(
        keys.reduce(
          (sum, key) => sum + breakdown[key] * opts.weights[key],
          0
        )
      ),
      breakdown,
      evidence: {
        contributedFiles: contributedFiles.sort(),
        ownedFiles: ownedFiles.sort()
      },
      reason: "ranked"
    };
  }).sort(
    (a, b) => b.score - a.score || compare(lower(a.username), lower(b.username)) || compare(a.id, b.id)
  );
  const evidenced = scored.filter(
    (c) => c.evidence.contributedFiles.length + c.evidence.ownedFiles.length > 0
  );
  let selected = evidenced.filter((c) => c.score >= opts.minScore).slice(0, opts.limit);
  if (!selected.length && opts.fallback && files.length) {
    const tier = (c) => c.evidence.ownedFiles.length ? 0 : c.breakdown.access >= 0.9 ? 1 : 2;
    selected = [...scored].sort(
      (a, b) => tier(a) - tier(b) || b.score - a.score || compare(lower(a.username), lower(b.username))
    ).slice(0, opts.limit).map((c) => ({
      ...c,
      reason: c.evidence.ownedFiles.length ? "owner-fallback" : c.breakdown.access >= 0.9 ? "maintainer-fallback" : "member-fallback"
    }));
  }
  return {
    selected,
    belowThreshold: evidenced.filter((c) => c.score < opts.minScore).slice(0, 3),
    warnings: [...snapshot.warnings],
    partial: snapshot.warnings.length > 0,
    context: snapshot.context
  };
}

// src/config.ts
var rankingKeys = /* @__PURE__ */ new Set([
  "limit",
  "minScore",
  "historyLimit",
  "maxReviewLoad",
  "halfLifeDays",
  "horizonDays",
  "now",
  "exclude",
  "aliases",
  "weights",
  "fallback"
]);
function parseConfig(content) {
  try {
    const value = object(JSON.parse(content));
    if (Object.keys(value).some((key) => !rankingKeys.has(key)))
      throw new Error("Unknown option");
    const config = value;
    resolveOptions(config);
    return config;
  } catch {
    throw new ReviewerError(
      "INVALID_OPTIONS",
      "Configuration must contain valid JSON ranking options."
    );
  }
}

// src/providers/github.ts
function createGitHubProvider(options) {
  const http = new HttpClient(
    options.apiUrl ?? "https://api.github.com",
    options,
    {
      Authorization: `Bearer ${options.token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  );
  const host = http.base.origin;
  const identity = (value) => {
    const user = object(value);
    return {
      provider: "github",
      host,
      id: id(user.id),
      username: string(user.login)
    };
  };
  const root = (request) => {
    if (!/^[^/]+\/[^/]+$/.test(request.repository))
      throw new ReviewerError(
        "INVALID_OPTIONS",
        "GitHub repository must be owner/repo."
      );
    return `repos/${request.repository.split("/").map(encodeURIComponent).join("/")}`;
  };
  return {
    platform: "github",
    host,
    ...options.logger ? { logger: options.logger } : {},
    async context(request) {
      const path = root(request);
      const raw = object(
        (await http.request(`${path}/pulls/${request.number}`)).data
      );
      const files = await http.pages(`${path}/pulls/${request.number}/files`);
      if (files.length !== number(raw.changed_files))
        throw new ReviewerError(
          "TRUNCATED",
          "GitHub changed-file list is incomplete."
        );
      const changed = files.map((value) => {
        const file = object(value);
        const status = string(file.status);
        return {
          path: string(file.filename),
          status: status === "added" ? "added" : status === "removed" ? "deleted" : status === "renamed" ? "renamed" : "modified",
          ...typeof file.previous_filename === "string" ? { previousPath: file.previous_filename } : {}
        };
      });
      return {
        ...request,
        author: identity(raw.user).username,
        existingReviewers: array(raw.requested_reviewers).map(identity),
        baseSha: string(object(raw.base).sha),
        state: raw.state === "open" ? "open" : "closed",
        draft: raw.draft === true,
        files: changed
      };
    },
    async members(request) {
      return (await http.pages(`${root(request)}/collaborators`, {
        affiliation: "all"
      })).map((value) => {
        const member = object(value);
        const permissions = object(member.permissions);
        return {
          ...identity(member),
          active: !member.suspended_at,
          bot: member.type === "Bot",
          access: permissions.admin === true ? 1 : permissions.maintain === true ? 0.9 : permissions.push === true ? 0.6 : 0,
          emails: []
        };
      });
    },
    async history(context, path, limit) {
      return (await http.pages(
        `${root(context)}/commits`,
        { path, sha: context.baseSha },
        limit
      )).map((value) => {
        const commit = object(value);
        const author = object(object(commit.commit).author);
        return {
          sha: string(commit.sha),
          date: string(author.date),
          ...typeof author.email === "string" ? { email: author.email } : {},
          ...commit.author ? { username: identity(commit.author).username } : {}
        };
      });
    },
    async file(context, path) {
      const response = await http.request(
        `${root(context)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
        { ref: context.baseSha },
        "GET",
        void 0,
        true
      );
      if (!response) return null;
      const raw = object(response.data);
      if (raw.encoding !== "base64")
        throw new ReviewerError(
          "UNSUPPORTED",
          "GitHub file content is unavailable in base64."
        );
      return Buffer.from(string(raw.content), "base64").toString("utf8");
    },
    async owners(context, owners, members) {
      const resolved = /* @__PURE__ */ new Set();
      const candidates = new Map(
        members.filter((m) => m.access >= 0.6 && m.active && !m.bot).map((m) => [m.username.toLowerCase(), m.username])
      );
      for (const owner of owners) {
        if (owner.includes("/")) {
          const [org, team] = owner.split("/");
          if (!org || org !== context.repository.split("/")[0]?.toLowerCase() || !team)
            continue;
          const access = await http.request(
            `orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(team)}/repos/${context.repository.split("/").map(encodeURIComponent).join("/")}`,
            {},
            "GET",
            void 0,
            true
          );
          if (!access || object(object(access.data).permissions).push !== true)
            continue;
          for (const value of await http.pages(
            `orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(team)}/members`
          )) {
            const username = identity(value).username.toLowerCase();
            if (candidates.has(username)) resolved.add(username);
          }
        } else if (owner.includes("@")) {
          for (const member of members)
            if (member.emails.some((email) => email.toLowerCase() === owner) && candidates.has(member.username.toLowerCase()))
              resolved.add(member.username);
        } else if (candidates.has(owner)) resolved.add(owner);
      }
      return [...resolved];
    },
    async loads(context) {
      const loads = /* @__PURE__ */ Object.create(null);
      for (const value of await http.pages(`${root(context)}/pulls`, {
        state: "open"
      })) {
        const request = object(value);
        if (number(request.number) === context.number) continue;
        for (const reviewer of array(request.requested_reviewers)) {
          const username = identity(reviewer).username.toLowerCase();
          loads[username] = (loads[username] ?? 0) + 1;
        }
      }
      return loads;
    },
    async assign(context, reviewers) {
      await http.request(
        `${root(context)}/pulls/${context.number}/requested_reviewers`,
        {},
        "POST",
        { reviewers: reviewers.map((r) => r.username) }
      );
    }
  };
}

// src/providers/gitlab.ts
function createGitLabProvider(options) {
  const http = new HttpClient(
    options.apiUrl ?? "https://gitlab.com/api/v4",
    options,
    { "PRIVATE-TOKEN": options.token }
  );
  const host = http.base.origin;
  const identity = (value) => {
    const user = object(value);
    return {
      provider: "gitlab",
      host,
      id: id(user.id),
      username: string(user.username)
    };
  };
  const root = (request) => `projects/${encodeURIComponent(request.repository)}`;
  const member = (value) => {
    const raw = object(value);
    const access = number(raw.access_level);
    return {
      ...identity(raw),
      active: raw.state === "active",
      bot: raw.bot === true || /^(project|group)_\d+_bot/.test(string(raw.username)),
      access: access >= 50 ? 1 : access >= 40 ? 0.9 : access >= 30 ? 0.6 : 0,
      emails: typeof raw.email === "string" ? [raw.email] : []
    };
  };
  const eligibleGroups = async (request) => {
    const project = object((await http.request(root(request))).data);
    const groups = /* @__PURE__ */ new Set();
    const addShares = (resource) => {
      for (const value of array(resource.shared_with_groups)) {
        const share = object(value);
        if (number(share.group_access_level) >= 30)
          groups.add(id(share.group_id));
      }
    };
    addShares(project);
    const namespace = object(project.namespace);
    let parent = namespace.kind === "group" ? namespace.id : null;
    const visited = /* @__PURE__ */ new Set();
    while (parent !== null) {
      const groupId = id(parent);
      if (visited.has(groupId) || visited.size >= 100)
        throw new ReviewerError("INVALID_RESPONSE", "Invalid group ancestry.");
      visited.add(groupId);
      groups.add(groupId);
      const group = object(
        (await http.request(`groups/${encodeURIComponent(groupId)}`)).data
      );
      addShares(group);
      parent = group.parent_id;
    }
    return groups;
  };
  return {
    platform: "gitlab",
    host,
    ...options.logger ? { logger: options.logger } : {},
    async context(request) {
      const path = `${root(request)}/merge_requests/${request.number}`;
      const raw = object((await http.request(path)).data);
      const diffs = await http.pages(`${path}/diffs`);
      if (typeof raw.changes_count !== "string" || raw.changes_count.endsWith("+") || Number(raw.changes_count) !== diffs.length)
        throw new ReviewerError(
          "TRUNCATED",
          "GitLab changed-file list is incomplete."
        );
      const branch = object(
        (await http.request(
          `${root(request)}/repository/branches/${encodeURIComponent(string(raw.target_branch))}`
        )).data
      );
      return {
        ...request,
        author: identity(raw.author).username,
        existingReviewers: array(raw.reviewers).map(identity),
        baseSha: string(object(branch.commit).id),
        state: raw.state === "opened" ? "open" : "closed",
        draft: raw.draft === true || raw.work_in_progress === true,
        files: diffs.map((value) => {
          const file = object(value);
          return {
            path: string(file.new_path),
            status: file.new_file === true ? "added" : file.deleted_file === true ? "deleted" : file.renamed_file === true ? "renamed" : "modified",
            ...file.renamed_file === true ? { previousPath: string(file.old_path) } : {}
          };
        })
      };
    },
    async members(request) {
      return (await http.pages(`${root(request)}/members/all`)).map(member);
    },
    async history(context, path, limit) {
      return (await http.pages(
        `${root(context)}/repository/commits`,
        { path, ref_name: context.baseSha },
        limit
      )).map((value) => {
        const raw = object(value);
        return {
          sha: string(raw.id),
          date: string(raw.authored_date),
          ...typeof raw.author_email === "string" ? { email: raw.author_email } : {}
        };
      });
    },
    async file(context, path) {
      const response = await http.request(
        `${root(context)}/repository/files/${encodeURIComponent(path)}`,
        { ref: context.baseSha },
        "GET",
        void 0,
        true
      );
      if (!response) return null;
      const raw = object(response.data);
      if (raw.encoding !== "base64")
        throw new ReviewerError(
          "UNSUPPORTED",
          "GitLab file content is unavailable in base64."
        );
      return Buffer.from(string(raw.content), "base64").toString("utf8");
    },
    async owners(context, owners, members) {
      const resolved = /* @__PURE__ */ new Set();
      const eligible = members.filter(
        (m) => m.access >= 0.6 && m.active && !m.bot
      );
      let direct;
      let groups;
      for (const owner of owners) {
        if (owner.startsWith("@@")) {
          const role = owner.slice(2).replace(/s$/, "");
          const level = { developer: 0.6, maintainer: 0.9, owner: 1 }[role];
          if (level === void 0) continue;
          direct ??= (await http.pages(`${root(context)}/members`)).map(member);
          for (const person of direct)
            if (person.access === level && eligible.some((e) => e.id === person.id))
              resolved.add(person.username);
          continue;
        }
        const users = eligible.filter(
          (m) => m.username.toLowerCase() === owner || m.emails.some((email) => email.toLowerCase() === owner)
        );
        if (users.length) {
          for (const user of users) resolved.add(user.username);
          continue;
        }
        if (owner.includes("@")) continue;
        const group = await http.request(
          `groups/${encodeURIComponent(owner)}`,
          {},
          "GET",
          void 0,
          true
        );
        if (!group) continue;
        groups ??= await eligibleGroups(context);
        if (!groups.has(id(object(group.data).id))) continue;
        for (const raw of await http.pages(
          `groups/${id(object(group.data).id)}/members`
        )) {
          const person = identity(raw);
          if (eligible.some((e) => e.id === person.id))
            resolved.add(person.username);
        }
      }
      return [...resolved];
    },
    async loads(context) {
      const loads = /* @__PURE__ */ Object.create(null);
      for (const value of await http.pages(`${root(context)}/merge_requests`, {
        state: "opened",
        scope: "all"
      })) {
        const request = object(value);
        if (number(request.iid) === context.number) continue;
        const reviewers = await http.pages(
          `${root(context)}/merge_requests/${number(request.iid)}/reviewers`
        );
        for (const value2 of reviewers) {
          const review = object(value2);
          if (review.state === "reviewed") continue;
          if (review.state !== "unreviewed")
            throw new ReviewerError(
              "UNSUPPORTED",
              "Unknown GitLab reviewer state."
            );
          const username = identity(review.user).username.toLowerCase();
          loads[username] = (loads[username] ?? 0) + 1;
        }
      }
      return loads;
    },
    async assign(context, reviewers) {
      await http.request(
        `${root(context)}/merge_requests/${context.number}`,
        {},
        "PUT",
        {
          reviewer_ids: [
            ...new Set(
              [...context.existingReviewers, ...reviewers].map((r) => r.id)
            )
          ]
        }
      );
    }
  };
}

// src/codeowners.ts
function parseCodeOwners(content, platform) {
  const rules = [];
  let section = "";
  let defaults2 = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = (platform === "github" ? raw.replace(/\s+#.*$/, "") : raw).trim();
    if (!line || line.startsWith("#")) continue;
    const heading = /^\^?\[([^\]]+)\](?:\[\d+\])?(?:\s+(.*))?$/.exec(line);
    if (platform === "gitlab" && heading) {
      section = string(heading[1]).toLowerCase();
      defaults2 = (heading[2] ?? "").split(/\s+/).filter(Boolean);
      continue;
    }
    const [pattern, ...owners] = line.split(/\s+/);
    if (!pattern || platform === "github" && /[![\]\\]/.test(pattern))
      continue;
    rules.push({
      pattern: pattern.replace(/^!/, ""),
      owners: (owners.length ? owners : defaults2).filter((owner) => owner.includes("@")).map((owner) => owner.replace(/^@(?!@)/, "").toLowerCase()),
      section,
      exclude: platform === "gitlab" && pattern.startsWith("!")
    });
  }
  return rules;
}
function matches(pattern, path) {
  const anchored = pattern.startsWith("/");
  let value = pattern.replace(/^\//, "");
  const directory = value.endsWith("/");
  if (directory) value = value.slice(0, -1);
  let source = "";
  for (let i = 0; i < value.length; i++) {
    const char = value.charAt(i);
    if (char === "*" && value[i + 1] === "*") {
      if (value[i + 2] === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i++;
      }
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  const prefix = anchored || value.includes("/") ? "^" : "(?:^|/)";
  return new RegExp(
    `${prefix}${source}${directory ? "/.*" : "(?:/.*)?"}$`
  ).test(path);
}
function resolveCodeOwners(path, rules) {
  const sections = /* @__PURE__ */ new Map();
  const excluded = /* @__PURE__ */ new Set();
  for (const rule of rules) {
    if (!matches(rule.pattern, path)) continue;
    if (rule.exclude) {
      excluded.add(rule.section);
      sections.delete(rule.section);
    } else if (!excluded.has(rule.section))
      sections.set(rule.section, rule.owners);
  }
  return [...new Set([...sections.values()].flat())].sort();
}

// src/service.ts
function validateRequest(request) {
  if (!request.repository.trim() || !Number.isSafeInteger(request.number) || request.number < 1)
    throw new ReviewerError(
      "INVALID_OPTIONS",
      "Repository and positive request number are required."
    );
}
async function suggestReviewers(provider, request, options = {}) {
  validateRequest(request);
  const opts = resolveOptions(options);
  provider.logger?.debug("Collecting reviewer evidence.", {
    provider: provider.platform
  });
  const [context, fetchedMembers] = await Promise.all([
    provider.context(request),
    provider.members(request)
  ]);
  const members = fetchedMembers.map((member) => ({
    ...member,
    emails: [...member.emails]
  }));
  const warnings = [];
  const optional = async (operation, fallback, label) => {
    try {
      return await operation();
    } catch (error) {
      const warning = {
        code: errorCode(error),
        message: `${label} unavailable.`
      };
      warnings.push(warning);
      provider.logger?.warn(warning.message, { code: warning.code });
      return fallback;
    }
  };
  for (const member of members)
    for (const [email, username] of Object.entries(opts.aliases))
      if (member.username.toLowerCase() === username.toLowerCase())
        member.emails = [...member.emails, email];
  let content = "";
  const locations = provider.platform === "github" ? [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"] : ["CODEOWNERS", "docs/CODEOWNERS", ".gitlab/CODEOWNERS"];
  await optional(
    async () => {
      for (const location of locations) {
        const file = await provider.file(context, location);
        if (file !== null) {
          content = file;
          break;
        }
      }
    },
    void 0,
    "CODEOWNERS"
  );
  const rules = parseCodeOwners(content, provider.platform);
  const histories = /* @__PURE__ */ new Map();
  const owners = /* @__PURE__ */ new Map();
  const history = (path) => {
    if (!histories.has(path))
      histories.set(
        path,
        optional(
          () => provider.history(context, path, opts.historyLimit),
          [],
          "Commit history"
        )
      );
    return histories.get(path);
  };
  const [files, loads] = await Promise.all([
    Promise.all(
      [...new Map(context.files.map((file) => [file.path, file])).values()].map(
        async (file) => {
          let historySource = file.previousPath ?? file.path;
          let contributions = await history(historySource);
          const parent = historySource.includes("/") ? historySource.slice(0, historySource.lastIndexOf("/")) : "";
          if (!contributions.length && parent) {
            historySource = parent;
            contributions = await history(parent);
          }
          const refs = resolveCodeOwners(file.path, rules);
          const key = JSON.stringify(refs);
          if (!owners.has(key))
            owners.set(
              key,
              optional(
                () => provider.owners(context, refs, members),
                [],
                "Owner resolution"
              )
            );
          return {
            path: file.path,
            historySource,
            contributions,
            owners: await owners.get(key)
          };
        }
      )
    ),
    optional(
      async () => {
        const known = await provider.loads(context);
        return Object.fromEntries(
          members.map((member) => [
            member.username.toLowerCase(),
            known[member.username.toLowerCase()] ?? 0
          ])
        );
      },
      {},
      "Review workload"
    )
  ]);
  warnings.sort(
    (a, b) => a.code.localeCompare(b.code) || a.message.localeCompare(b.message)
  );
  const result = rankReviewers(
    { context, members, files, loads, warnings },
    opts
  );
  provider.logger?.info("Reviewer suggestions ready.", {
    selected: result.selected.length,
    partial: result.partial
  });
  return result;
}
async function assignReviewers(provider, request, reviewers) {
  validateRequest(request);
  const [context, members] = await Promise.all([
    provider.context(request),
    provider.members(request)
  ]);
  if (context.state !== "open" || context.draft)
    throw new ReviewerError(
      "NOT_ASSIGNABLE",
      "Request must be open and ready for review."
    );
  const unique = [
    ...new Map(reviewers.map((reviewer) => [reviewer.id, reviewer])).values()
  ];
  for (const reviewer of unique) {
    if (reviewer.provider !== provider.platform || reviewer.host !== provider.host || !members.some(
      (m) => m.id === reviewer.id && m.username.toLowerCase() === reviewer.username.toLowerCase() && m.active && !m.bot && m.access >= 0.6
    ) || reviewer.username.toLowerCase() === context.author.toLowerCase())
      throw new ReviewerError(
        "INELIGIBLE",
        "Reviewer identity or eligibility could not be verified."
      );
  }
  const skipped = unique.filter(
    (r) => context.existingReviewers.some((e) => e.id === r.id)
  );
  const pending = unique.filter((r) => !skipped.includes(r));
  if (!pending.length) return { assigned: [], skipped, failed: [] };
  try {
    await provider.assign(context, pending);
    provider.logger?.info("Reviewers assigned.", { count: pending.length });
    return { assigned: pending, skipped, failed: [] };
  } catch (error) {
    provider.logger?.warn("Assignment requires reconciliation.", {
      code: errorCode(error)
    });
    try {
      const current = await provider.context(request);
      return {
        assigned: pending.filter(
          (r) => current.existingReviewers.some((e) => e.id === r.id)
        ),
        skipped,
        failed: pending.filter((r) => !current.existingReviewers.some((e) => e.id === r.id)).map((reviewer) => ({ reviewer, code: errorCode(error) }))
      };
    } catch {
      return {
        assigned: [],
        skipped,
        failed: pending.map((reviewer) => ({
          reviewer,
          code: "ASSIGNMENT_UNCONFIRMED"
        }))
      };
    }
  }
}

// src/action.ts
var escape = (value) => value.replace(/[&<>|\r\n]/g, (char) => `&#${char.charCodeAt(0)};`);
async function runAction(io) {
  const platform = io.input("provider") || "github";
  if (platform !== "github" && platform !== "gitlab")
    throw new ReviewerError("INVALID_OPTIONS", "Unknown provider.");
  const assign = io.input("assign") || "false";
  if (assign !== "true" && assign !== "false")
    throw new ReviewerError("INVALID_OPTIONS", "assign must be true or false.");
  if (platform === "gitlab" && (!io.input("repository") || !io.input("number")))
    throw new ReviewerError(
      "INVALID_OPTIONS",
      "GitLab requires explicit repository and number inputs."
    );
  const event = object(io.event);
  const repository = io.input("repository") || string(object(event.repository).full_name);
  const requestNumber = io.input("number");
  const request = {
    repository,
    number: requestNumber ? Number(requestNumber) : number(object(event.pull_request).number)
  };
  const connection = {
    token: io.input("token"),
    ...io.input("api-url") ? { apiUrl: io.input("api-url") } : {}
  };
  const provider = io.provider ? io.provider(platform, connection) : platform === "github" ? createGitHubProvider(connection) : createGitLabProvider(connection);
  const configPath = io.input("config-path");
  let config = {};
  if (configPath) {
    const context = await provider.context(request);
    const content = await provider.file(context, configPath);
    if (content === null)
      throw new ReviewerError(
        "INVALID_OPTIONS",
        "Requested configuration file was not found at the base revision."
      );
    config = parseConfig(content);
  }
  const limit = io.input("limit");
  const result = await suggestReviewers(provider, request, {
    ...config,
    ...limit ? { limit: Number(limit) } : {}
  });
  const assignment = assign === "true" ? await assignReviewers(provider, request, result.selected) : { assigned: [], skipped: [], failed: [] };
  await io.output(
    "reviewers",
    JSON.stringify(result.selected.map((r) => r.username))
  );
  await io.output("result", JSON.stringify(result));
  await io.output("assignment", JSON.stringify(assignment));
  await io.summary(
    `## Reviewer suggestions

| Reviewer | Score | Reason |
| --- | ---: | --- |
${result.selected.map((r) => `| ${escape(r.username)} | ${r.score.toFixed(4)} | ${r.reason} |`).join("\n")}

${result.partial ? "Some optional signals were unavailable. Inspect result.warnings.\n" : ""}`
  );
  if (assignment.failed.length)
    throw new ReviewerError(
      "ASSIGNMENT_FAILED",
      "Some reviewers could not be assigned. Inspect the assignment output."
    );
}

// src/action-entry.ts
try {
  await runAction({
    input: (name) => process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] ?? "",
    event: JSON.parse(
      await readFile(string(process.env.GITHUB_EVENT_PATH), "utf8")
    ),
    output: async (name, value) => {
      const delimiter = randomUUID();
      await appendFile(
        string(process.env.GITHUB_OUTPUT),
        `${name}<<${delimiter}
${value}
${delimiter}
`
      );
    },
    summary: async (value) => {
      await appendFile(string(process.env.GITHUB_STEP_SUMMARY), value);
    }
  });
} catch (error) {
  process.stderr.write(`Reviewer Action failed: ${errorCode(error)}
`);
  process.exitCode = 1;
}
