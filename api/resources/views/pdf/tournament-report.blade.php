<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{{ $tournament->name }} — Full Tournament Report</title>
<style>
    {{-- DomPDF's CSS support is a plain-CSS2.1-plus-some-CSS3 subset (no
    flexbox/grid) — everything here deliberately sticks to tables, block
    elements, and floats, which it renders reliably. --}}
    body { font-family: 'DejaVu Sans', sans-serif; font-size: 10px; color: #1e293b; }
    h1 { font-size: 20px; margin: 0 0 2px; color: #0f172a; }
    h2 { font-size: 14px; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #0d9488; color: #0d9488; }
    h3 { font-size: 11px; margin: 12px 0 6px; color: #334155; }
    .muted { color: #64748b; }
    .subtitle { margin: 0 0 12px; }
    table.header-table td { padding: 2px 10px 2px 0; vertical-align: top; }
    table.header-table td.label { color: #64748b; white-space: nowrap; }
    .champion-line { color: #b45309; font-weight: bold; }

    .match-block { margin-bottom: 12px; padding: 7px 9px; border: 1px solid #e2e8f0; border-radius: 4px; page-break-inside: avoid; }
    table.match-header { width: 100%; }
    table.match-header td { padding: 0; }
    .side-name { font-weight: bold; font-size: 11px; }
    .side-score { font-weight: bold; font-size: 13px; color: #0f172a; }
    .vs { text-align: center; color: #94a3b8; font-size: 9px; }
    .match-meta { margin: 4px 0 0; color: #64748b; font-size: 9px; }
    .winner-tag { color: #0d9488; font-weight: bold; }

    {{-- Pixel-positioned to mirror BracketView.tsx's own left-to-right
    horizontal bracket layout: rounds as columns, cards vertically centered
    over the two matches that feed them, connected by real elbowed lines
    (rendered as a single embedded SVG image — see buildEliminationTree()'s
    own comment on why an <img> data-URI, not inline <svg> markup, is what
    actually draws in DomPDF). --}}
    .bracket-wrap { position: relative; margin-bottom: 8px; }
    .bracket-connectors { position: absolute; left: 0; top: 0; }
    .bracket-round-label {
        position: absolute; text-align: center; font-size: 9px; font-weight: bold;
        color: #0d9488; text-transform: uppercase; letter-spacing: 0.04em;
    }
    .bracket-track-label {
        position: absolute; text-align: left; font-size: 10px; font-weight: bold;
        text-transform: uppercase; letter-spacing: 0.04em;
    }
    {{-- Swiss's per-round record buckets ("2-0", "1-1", ...) — smaller and
    plainer than a round header, since several stack inside one round column. --}}
    .bracket-bucket-label {
        position: absolute; text-align: center; font-size: 7.5px; font-weight: bold;
        text-transform: uppercase; letter-spacing: 0.03em;
    }
    .bracket-box {
        position: absolute; border: 1.5px solid #cbd5e1; border-radius: 3px;
        background: #ffffff; padding: 3px 7px;
    }
    .bracket-side { font-size: 9px; color: #475569; white-space: nowrap; overflow: hidden; padding: 2px 0; }
    .bracket-side .bracket-score { float: right; font-weight: bold; color: #475569; }
    .bracket-side.bracket-winner { color: #0f172a; font-weight: bold; }
    .bracket-side.bracket-winner .bracket-score { color: #0d9488; }

    {{-- group_stage's per-group standings card — a plain bordered table,
    several laid out side by side via inline-block (safer in DomPDF than
    float for a wrapping row of cards). --}}
    .group-card { display: inline-block; width: 190px; vertical-align: top; margin: 0 10px 10px 0; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; }
    .group-card-header { background: #0d9488; color: #ffffff; padding: 4px 8px; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; text-align: center; }
    table.group-table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
    table.group-table th, table.group-table td { padding: 3px 5px; border-bottom: 1px solid #f1f5f9; text-align: right; }
    table.group-table th:first-child, table.group-table td:first-child { text-align: left; }
    table.group-table th { color: #64748b; font-weight: normal; }
    tr.group-advancing { background: #f0fdfa; }
    tr.group-advancing td:first-child { font-weight: bold; color: #0f172a; }

    table.detail-table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 8.5px; }
    table.detail-table th, table.detail-table td { border: 1px solid #e2e8f0; padding: 3px 5px; text-align: left; }
    table.detail-table th { background: #f8fafc; color: #475569; }
    .detail-caption { margin: 6px 0 2px; font-weight: bold; font-size: 8.5px; color: #475569; text-transform: uppercase; letter-spacing: 0.04em; }

    table.rankings-table { width: 100%; border-collapse: collapse; }
    table.rankings-table th, table.rankings-table td { border: 1px solid #e2e8f0; padding: 4px 6px; font-size: 9px; }
    table.rankings-table th { background: #0d9488; color: #ffffff; text-align: left; }
    tr.rank-1 { background: #fef3c7; }
    tr.rank-1 td { font-weight: bold; }

    .empty-note { color: #94a3b8; font-style: italic; }
    .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 8px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
    <h1>{{ $tournament->name }}</h1>
    <p class="subtitle muted">
        {{ $tournament->sport->name }}
        @if($tournament->sportFormat) &middot; {{ $tournament->sportFormat->name }} @endif
        &middot; {{ str_replace('_', ' ', ucfirst($tournament->format)) }}
        &middot; Report generated {{ now()->format('F j, Y g:i A') }}
    </p>

    <table class="header-table">
        <tr>
            <td class="label">Status</td><td>{{ ucfirst($tournament->status) }}</td>
            <td class="label">Venue</td><td>{{ $tournament->venue?->name ?? '—' }}</td>
        </tr>
        <tr>
            <td class="label">Starts</td><td>{{ $tournament->starts_at?->format('M j, Y g:i A') ?? '—' }}</td>
            <td class="label">Organizer</td><td>{{ $tournament->organizer?->name ?? '—' }}</td>
        </tr>
        @if($tournament->champion || $tournament->championTeam)
        <tr>
            <td class="label">Champion</td>
            <td colspan="3" class="champion-line">&#127942; {{ $tournament->championTeam?->name ?? $tournament->champion?->name }}</td>
        </tr>
        @endif
    </table>

    @if($groupStandings)
    <h2>Group Standings</h2>
    <div style="margin-bottom: 4px;">
        @foreach($groupStandings as $group)
            <div class="group-card">
                <div class="group-card-header">{{ $group['label'] }}</div>
                <table class="group-table">
                    <tr><th>Name</th><th>W</th><th>For</th><th>Against</th><th>Diff</th></tr>
                    @foreach($group['standings'] as $i => $s)
                        <tr class="{{ $i < $group['advance_count'] ? 'group-advancing' : '' }}">
                            <td>{{ $s['name'] }}</td>
                            <td>{{ $s['wins'] }}</td>
                            <td>{{ $s['for'] }}</td>
                            <td>{{ $s['against'] }}</td>
                            <td>{{ $s['diff'] > 0 ? '+' : '' }}{{ $s['diff'] }}</td>
                        </tr>
                    @endforeach
                </table>
            </div>
        @endforeach
    </div>
    @endif

    @if($bracketTree)
    <h2>Bracket</h2>
    <div class="bracket-wrap" style="width: {{ $bracketTree['width'] }}px; height: {{ $bracketTree['height'] }}px;">
        <img class="bracket-connectors" src="{{ $bracketTree['connector_image'] }}"
             width="{{ $bracketTree['width'] }}" height="{{ $bracketTree['height'] }}">
        @foreach($bracketTree['labels'] as $label)
            @php
                $labelClass = !empty($label['bucket'])
                    ? 'bracket-bucket-label'
                    : (isset($label['color']) ? 'bracket-track-label' : 'bracket-round-label');
            @endphp
            <div class="{{ $labelClass }}"
                 style="left: {{ $label['x'] }}px; top: {{ $label['y'] }}px; width: {{ $label['width'] }}px; {{ isset($label['color']) ? 'color: '.$label['color'].';' : '' }}">
                {{ $label['text'] }}
            </div>
        @endforeach
        @foreach($bracketTree['boxes'] as $box)
            <div class="bracket-box" style="left: {{ $box['x'] }}px; top: {{ $box['top'] }}px; width: {{ $bracketTree['box_width'] }}px; height: {{ $bracketTree['box_height'] }}px;">
                <div class="bracket-side {{ $box['winner_side'] === 'a' ? 'bracket-winner' : '' }}">
                    {{ $box['name_a'] }}<span class="bracket-score">{{ $box['score_a'] ?? '' }}</span>
                </div>
                <div class="bracket-side {{ $box['winner_side'] === 'b' ? 'bracket-winner' : '' }}">
                    {{ $box['name_b'] }}<span class="bracket-score">{{ $box['score_b'] ?? '' }}</span>
                </div>
            </div>
        @endforeach
    </div>
    @endif

    <h2>{{ $bracketTree ? 'Match Details' : 'Match Results' }}</h2>
    @forelse($matchesByRound as $roundLabel => $roundMatches)
        <h3>{{ $roundLabel }}</h3>
        @foreach($roundMatches as $match)
            <div class="match-block">
                <table class="match-header">
                    <tr>
                        <td style="width: 42%;">
                            <span class="side-name">{{ $match['name_a'] }}</span><br>
                            <span class="side-score">{{ $match['score_a'] ?? '—' }}</span>
                        </td>
                        <td style="width: 16%;" class="vs">VS<br>{{ $match['status'] }}</td>
                        <td style="width: 42%; text-align: right;">
                            <span class="side-name">{{ $match['name_b'] }}</span><br>
                            <span class="side-score">{{ $match['score_b'] ?? '—' }}</span>
                        </td>
                    </tr>
                </table>
                <p class="match-meta">
                    @if($match['court']){{ $match['court'] }} &middot; @endif
                    @if($match['scheduled_at']){{ $match['scheduled_at'] }} &middot; @endif
                    @if($match['winner'])Winner: <span class="winner-tag">{{ $match['winner'] }}</span>@if($match['won_by_default']) (by default)@endif
                    @else<span class="empty-note">Not yet decided</span>@endif
                </p>

                @if(count($match['stats']))
                <p class="detail-caption">Player Statistics</p>
                <table class="detail-table">
                    <tr>
                        <th>Player</th><th>Side</th>
                        @foreach($fieldLabels as $label)<th>{{ $label }}</th>@endforeach
                    </tr>
                    @foreach($match['stats'] as $stat)
                    <tr>
                        <td>{{ $stat['player'] }}</td><td>{{ $stat['side'] }}</td>
                        @foreach($fieldLabels as $key => $label)<td>{{ $stat['values'][$key] ?? 0 }}</td>@endforeach
                    </tr>
                    @endforeach
                </table>
                @endif

                @if(count($match['log']))
                <p class="detail-caption">Match Log</p>
                <table class="detail-table">
                    <tr><th style="width: 20%;">Time</th><th style="width: 20%;">Score</th><th>Note</th></tr>
                    @foreach($match['log'] as $entry)
                    <tr>
                        <td>{{ $entry['time'] }}</td>
                        <td>{{ $entry['score'] }}</td>
                        <td>{{ $entry['note'] }}</td>
                    </tr>
                    @endforeach
                </table>
                @endif
            </div>
        @endforeach
    @empty
        <p class="empty-note">No matches have been generated for this tournament yet.</p>
    @endforelse

    <h2>Player Rankings</h2>
    @if(count($rankings))
        <p class="muted" style="margin-top: -4px;">
            Ranked individually by {{ $primaryStatLabel }} across every match in this tournament — even for a
            team-sport tournament, this reflects the best-performing player, not just the winning team.
        </p>
        <table class="rankings-table">
            <tr>
                <th>Rank</th><th>Player</th><th>Team</th><th>Games</th>
                <th>{{ $primaryStatLabel }}</th><th>Per Game</th>
                @foreach($fieldLabels as $label)<th>{{ $label }}</th>@endforeach
            </tr>
            @foreach($rankings as $i => $r)
            <tr class="{{ $i === 0 ? 'rank-1' : '' }}">
                <td>{{ $i + 1 }}</td>
                <td>{{ $r['player'] }}</td>
                <td>{{ $r['team'] }}</td>
                <td>{{ $r['games'] }}</td>
                <td>{{ $r['primary_total'] }}</td>
                <td>{{ $r['per_game'] }}</td>
                @foreach($fieldLabels as $key => $label)<td>{{ $r['totals'][$key] ?? 0 }}</td>@endforeach
            </tr>
            @endforeach
        </table>
    @else
        <p class="empty-note">No player statistics have been recorded for this tournament yet.</p>
    @endif

    <p class="footer">SportsHub &middot; Full Tournament Report &middot; {{ $tournament->name }} &middot; Generated {{ now()->toIso8601String() }}</p>
</body>
</html>
