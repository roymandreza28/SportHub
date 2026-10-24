const fs = require('fs');
const path = require('path');

const root = path.join('C:\\', 'Users', 'User', 'source', 'repos', 'sporthub', 'docs', 'role-flowcharts');
fs.mkdirSync(root, { recursive: true });

const COLORS = {
  blue: '#1e9ad6',
  teal: '#2cb7b3',
  green: '#2dbf7d',
  red: '#ef5d4d',
  purple: '#9a66d9',
  lightGray: '#e5e7eb',
  darkGray: '#4b5563',
  labelBg: '#f3f4f6',
  border: '#7a7a7a',
  arrow: '#6b7280',
  text: '#1f2937',
  white: '#ffffff'
};

function textNode(x, y, text, options = {}) {
  const { size = 12, weight = 600, fill = COLORS.text, anchor = 'middle' } = options;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" font-family="Arial, sans-serif" fill="${fill}">${text}</text>`;
}

function rectNode(x, y, w, h, fill, text, subtext = '', textColor = '#fff') {
  const lines = [];
  lines.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${COLORS.border}" stroke-width="1.5"/>`);
  lines.push(textNode(x + w / 2, y + h / 2 - 5, text, { size: 13, weight: 700, fill: textColor }));
  if (subtext) {
    lines.push(textNode(x + w / 2, y + h / 2 + 15, subtext, { size: 10.5, weight: 500, fill: textColor }));
  }
  return lines.join('\n');
}

function diamondNode(x, y, w, h, fill, text, subtext = '', textColor = '#fff') {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const points = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
  const lines = [];
  lines.push(`<polygon points="${points}" fill="${fill}" stroke="${COLORS.border}" stroke-width="1.5"/>`);
  lines.push(textNode(cx, cy - 5, text, { size: 12.5, weight: 700, fill: textColor }));
  if (subtext) {
    lines.push(textNode(cx, cy + 14, subtext, { size: 9.5, weight: 500, fill: textColor }));
  }
  return lines.join('\n');
}

function arrowNode(x1, y1, x2, y2) {
  const midX = x1 + (x2 - x1) / 2;
  const delta = Math.abs(y2 - y1);
  const slope = y2 > y1 ? 1 : -1;
  const points = `${x1},${y1} ${midX},${y1} ${midX},${y2} ${x2},${y2}`;
  return `<path d="M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}" fill="none" stroke="${COLORS.arrow}" stroke-width="2" marker-end="url(#arrow)"/>`;
}

function buildFlowchart(filename, title, rows) {
  const width = 1550;
  const height = 900;
  const leftCol = 145;
  const startX = 250;
  const rowHeight = 114;
  const labelW = 120;
  const gap = 12;
  const blockW = 162;
  const blockH = 64;
  const areaWidth = width - startX - 24;
  const lines = [];

  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  lines.push('<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#6b7280"/></marker></defs>');
  lines.push(`<rect width="${width}" height="${height}" fill="#f2f2f2"/>`);
  lines.push(`<text x="${(width / 2)}" y="36" text-anchor="middle" font-size="26" font-weight="700" font-family="Arial, sans-serif" fill="#1f2937">${title}</text>`);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const y = 65 + rowIndex * rowHeight;
    lines.push(`<rect x="0" y="${y - 10}" width="${width}" height="${rowHeight - 8}" fill="${COLORS.labelBg}" stroke="${COLORS.border}" stroke-width="1"/>`);
    lines.push(`<rect x="0" y="${y - 10}" width="${leftCol}" height="${rowHeight - 8}" fill="#f2f2f2" stroke="${COLORS.border}" stroke-width="1"/>`);
    lines.push(textNode(70, y + 32, row.label, { size: 15, weight: 700, fill: COLORS.darkGray, anchor: 'middle' }));

    const totalBlocks = row.blocks.length;
    const available = areaWidth - ((totalBlocks - 1) * gap);
    const perBlock = available / totalBlocks;
    const rectW = Math.min(blockW, perBlock * 0.95);

    row.blocks.forEach((block, idx) => {
      const x = startX + idx * (rectW + gap);
      let b = null;
      if (block.type === 'diamond') {
        const dw = Math.min(160, rectW + 12);
        const dh = 60;
        b = diamondNode(x + (rectW - dw) / 2, y + 14, dw, dh, block.fill, block.text, block.subtext || '', '#ffffff');
      } else {
        b = rectNode(x, y + 18, rectW, blockH, block.fill, block.text, block.subtext || '', '#ffffff');
      }
      lines.push(b);

      if (row.blocks[idx + 1]) {
        const nextBlock = row.blocks[idx + 1];
        const nextX = startX + (idx + 1) * (rectW + gap);
        const nextW = Math.min(160, Math.min(blockW, ((areaWidth - ((totalBlocks - 1) * gap)) / totalBlocks) * 0.95));
        const currentRight = x + rectW;
        const nextLeft = nextX;
        if (block.type === 'diamond') {
          lines.push(`<path d="M ${currentRight} ${y + 52} L ${nextLeft} ${y + 52}" fill="none" stroke="${COLORS.arrow}" stroke-width="2" marker-end="url(#arrow)"/>`);
        } else {
          lines.push(`<path d="M ${currentRight} ${y + 52} L ${nextLeft} ${y + 52}" fill="none" stroke="${COLORS.arrow}" stroke-width="2" marker-end="url(#arrow)"/>`);
        }
      }
    });
  }

  lines.push('</svg>');
  fs.writeFileSync(path.join(root, filename), lines.join('\n'));
}

const modules = {
  'player.svg': {
    title: 'Player Module Flow',
    rows: [
      { label: 'Access', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Login', subtext: 'Authenticate' },
        { type: 'rect', fill: COLORS.teal, text: 'Assign Role', subtext: 'Player' },
        { type: 'rect', fill: COLORS.green, text: 'Open /player', subtext: 'Dashboard' }
      ]},
      { label: 'Core', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Newsfeed', subtext: 'Read/Post' },
        { type: 'rect', fill: COLORS.teal, text: 'Matchmaking', subtext: 'Find Opponent' },
        { type: 'rect', fill: COLORS.blue, text: 'Tournament', subtext: 'Register' },
        { type: 'rect', fill: COLORS.green, text: 'Venues', subtext: 'Bookings' }
      ]},
      { label: 'Social', blocks: [
        { type: 'rect', fill: COLORS.purple, text: 'My Posts', subtext: 'Profile' },
        { type: 'rect', fill: COLORS.purple, text: 'Friends', subtext: 'Chat' },
        { type: 'rect', fill: COLORS.green, text: 'Profile', subtext: 'Edit Info' }
      ]}
    ]
  },
  'coach.svg': {
    title: 'Coach Module Flow',
    rows: [
      { label: 'Access', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Register', subtext: 'Coach' },
        { type: 'rect', fill: COLORS.teal, text: 'Upload Proof', subtext: 'Eligibility' },
        { type: 'rect', fill: COLORS.green, text: 'Open /coach', subtext: 'Dashboard' }
      ]},
      { label: 'Coach Tasks', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Evaluate', subtext: 'Players' },
        { type: 'rect', fill: COLORS.teal, text: 'Team Matchmaking', subtext: 'Pair Players' },
        { type: 'rect', fill: COLORS.blue, text: 'Tournament', subtext: 'Register Players' },
        { type: 'rect', fill: COLORS.green, text: 'Venues', subtext: 'Bookings' }
      ]},
      { label: 'Social', blocks: [
        { type: 'rect', fill: COLORS.purple, text: 'My Posts', subtext: 'Coach Network' },
        { type: 'rect', fill: COLORS.purple, text: 'Friends', subtext: 'Chat' },
        { type: 'rect', fill: COLORS.green, text: 'Profile', subtext: 'Edit Info' }
      ]}
    ]
  },
  'venue_facilitator.svg': {
    title: 'Venue Facilitator Module Flow',
    rows: [
      { label: 'Access', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Login', subtext: 'Authenticate' },
        { type: 'rect', fill: COLORS.teal, text: 'Open /facilitator', subtext: 'Dashboard' },
        { type: 'rect', fill: COLORS.green, text: 'Manage Venues', subtext: 'Courts & Equipment' }
      ]},
      { label: 'Ops', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Review Bookings', subtext: 'Approve/Reject' },
        { type: 'rect', fill: COLORS.teal, text: 'Check Schedule', subtext: 'Calendar' },
        { type: 'rect', fill: COLORS.blue, text: 'News + Events', subtext: 'Publish Updates' },
        { type: 'rect', fill: COLORS.green, text: 'Tournaments', subtext: 'Own Venue' }
      ]},
      { label: 'Control', blocks: [
        { type: 'rect', fill: COLORS.purple, text: 'Operations', subtext: 'Monitor' },
        { type: 'rect', fill: COLORS.purple, text: 'Support', subtext: 'Respond' },
        { type: 'rect', fill: COLORS.green, text: 'Finalize', subtext: 'Ready State' }
      ]}
    ]
  },
  'main_organizer.svg': {
    title: 'Main Organizer Module Flow',
    rows: [
      { label: 'Access', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Login', subtext: 'Authenticate' },
        { type: 'rect', fill: COLORS.teal, text: 'Assign Role', subtext: 'Organizer' },
        { type: 'rect', fill: COLORS.green, text: 'Open /organizer', subtext: 'Dashboard' }
      ]},
      { label: 'Tournament', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Create Tournament', subtext: 'Format & Venue' },
        { type: 'rect', fill: COLORS.teal, text: 'Assign Venue Org', subtext: 'Match Control' },
        { type: 'rect', fill: COLORS.blue, text: 'Assign Livestream Org', subtext: 'Broadcast' },
        { type: 'rect', fill: COLORS.green, text: 'Generate Bracket', subtext: 'Schedule' }
      ]},
      { label: 'Result', blocks: [
        { type: 'rect', fill: COLORS.purple, text: 'Score Control', subtext: 'Live Match' },
        { type: 'rect', fill: COLORS.purple, text: 'Publish Results', subtext: 'Final Standings' },
        { type: 'rect', fill: COLORS.green, text: 'Finalize', subtext: 'Complete Event' }
      ]}
    ]
  },
  'venue_organizer.svg': {
    title: 'Venue Organizer Module Flow',
    rows: [
      { label: 'Assignment', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Tournament Assigned', subtext: 'By Organizer' },
        { type: 'rect', fill: COLORS.teal, text: 'Open /organizer', subtext: 'Dashboard' },
        { type: 'rect', fill: COLORS.green, text: 'Select Match', subtext: 'Assigned Event' }
      ]},
      { label: 'Scoring', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Start Scoreboard', subtext: 'Match Control' },
        { type: 'rect', fill: COLORS.teal, text: 'Track Points', subtext: 'Timeouts/Fouls' },
        { type: 'rect', fill: COLORS.blue, text: 'Live Updates', subtext: 'Real-Time' },
        { type: 'rect', fill: COLORS.green, text: 'Publish Result', subtext: 'Finalize' }
      ]},
      { label: 'Closeout', blocks: [
        { type: 'rect', fill: COLORS.purple, text: 'Review Match', subtext: 'Audit Check' },
        { type: 'rect', fill: COLORS.purple, text: 'Next Match', subtext: 'Continue' },
        { type: 'rect', fill: COLORS.green, text: 'Return to Schedule', subtext: 'Event Flow' }
      ]}
    ]
  },
  'livestream_organizer.svg': {
    title: 'Livestream Organizer Module Flow',
    rows: [
      { label: 'Assignment', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Tournament Assigned', subtext: 'By Organizer' },
        { type: 'rect', fill: COLORS.teal, text: 'Open /organizer', subtext: 'Dashboard' },
        { type: 'rect', fill: COLORS.green, text: 'Open Livestreams', subtext: 'Module' }
      ]},
      { label: 'Broadcast', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Configure Stream', subtext: 'Camera Settings' },
        { type: 'rect', fill: COLORS.teal, text: 'Go Live', subtext: 'Broadcast Event' },
        { type: 'rect', fill: COLORS.blue, text: 'Manage Chat', subtext: 'Feed Control' },
        { type: 'rect', fill: COLORS.green, text: 'Monitor', subtext: 'Quality' }
      ]},
      { label: 'Close', blocks: [
        { type: 'rect', fill: COLORS.purple, text: 'Close Broadcast', subtext: 'End Feed' },
        { type: 'rect', fill: COLORS.purple, text: 'Review Stream', subtext: 'Archive' },
        { type: 'rect', fill: COLORS.green, text: 'Finish Event', subtext: 'Complete' }
      ]}
    ]
  },
  'admin.svg': {
    title: 'Admin Module Flow',
    rows: [
      { label: 'Access', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Login', subtext: 'Authenticate' },
        { type: 'rect', fill: COLORS.teal, text: 'Assign Role', subtext: 'Admin' },
        { type: 'rect', fill: COLORS.green, text: 'Open /admin', subtext: 'Dashboard' }
      ]},
      { label: 'Management', blocks: [
        { type: 'rect', fill: COLORS.blue, text: 'Manage Users', subtext: 'Accounts' },
        { type: 'rect', fill: COLORS.teal, text: 'Review Verification', subtext: 'Proof Checks' },
        { type: 'rect', fill: COLORS.blue, text: 'Create Facilitators', subtext: 'Organizers' },
        { type: 'rect', fill: COLORS.green, text: 'Support Tickets', subtext: 'Inquiries' }
      ]},
      { label: 'Oversight', blocks: [
        { type: 'rect', fill: COLORS.purple, text: 'Audit Log', subtext: 'Actions' },
        { type: 'rect', fill: COLORS.purple, text: 'Platform Oversight', subtext: 'System View' },
        { type: 'rect', fill: COLORS.green, text: 'Complete Control', subtext: 'Full Access' }
      ]}
    ]
  }
};

for (const [filename, module] of Object.entries(modules)) {
  buildFlowchart(filename, module.title, module.rows);
}

const gallery = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SportHub Role Flowcharts</title>
  <style>
    body { font-family: Arial, sans-serif; background: #e5e7eb; margin: 0; padding: 22px; }
    h1 { text-align: center; margin-bottom: 24px; color: #111827; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 22px; }
    .card { background: #ffffff; border-radius: 12px; box-shadow: 0 10px 24px rgba(0,0,0,.08); padding: 10px; }
    .card h2 { text-align: center; color: #1f2937; margin: 8px 0 12px 0; font-size: 18px; }
    img { width: 100%; height: auto; display: block; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>SportHub User Module Flowcharts</h1>
  <div class="grid">
    <div class="card"><h2>Player</h2><img src="player.svg" alt="Player flowchart"/></div>
    <div class="card"><h2>Coach</h2><img src="coach.svg" alt="Coach flowchart"/></div>
    <div class="card"><h2>Venue Facilitator</h2><img src="venue_facilitator.svg" alt="Venue Facilitator flowchart"/></div>
    <div class="card"><h2>Main Organizer</h2><img src="main_organizer.svg" alt="Main Organizer flowchart"/></div>
    <div class="card"><h2>Venue Organizer</h2><img src="venue_organizer.svg" alt="Venue Organizer flowchart"/></div>
    <div class="card"><h2>Livestream Organizer</h2><img src="livestream_organizer.svg" alt="Livestream Organizer flowchart"/></div>
    <div class="card"><h2>Admin</h2><img src="admin.svg" alt="Admin flowchart"/></div>
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(root, 'index.html'), gallery);
console.log('Updated flowcharts in ' + root);
