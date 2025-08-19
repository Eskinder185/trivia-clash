// Trivia Clash game logic

const API_URL = "https://rithm-jeopardy.herokuapp.com/api/";
const NCAT = 6, NCLUE = 5;

let categories = [], activeClue = null;
let mode = 0, canPlay = true, numPlayers = 2, curr = 1;
let timer = null, timeLeft = 0, difficulty = "medium";
let stats = {}, hintsUsed = {};

const $play    = $("#play"),
      $hintBtn = $("#hint-btn"),
      $submit  = $("#submit-answer"),
      $spinner = $("#spinner"),
      $spinTxt = $("#spinner-text"),
      $active  = $("#active-clue"),
      $input   = $("#user-answer"),
      $timer   = $("#timer");

// Bind events
$play.on("click", startGame);
$hintBtn.on("click", showHint);
$submit.on("click", validateAnswer);

function startGame() {
  if (!canPlay) return;
  canPlay = false;
  // Read selections
  numPlayers = +$("#num-players").val();
  difficulty = $("#difficulty").val();

  initStats();            // set up stats & hints
  renderPlayerCards();    // draw player panels
  resetBoard();           // clear UI

  loadGame();             // fetch & build board
}

function initStats() {
  stats = {}; hintsUsed = {};
  for (let p = 1; p <= numPlayers; p++) {
    stats[p] = { score: 0, correct: 0, wrong: 0 };
    hintsUsed[p] = false;
  }
  curr = 1;
  updateStats();
}

function renderPlayerCards() {
  $("#game-controls .player-stats").remove();
  for (let p = 1; p <= numPlayers; p++) {
    $("#game-controls").prepend(`
      <div class="player-stats" id="p${p}">
        <h2>P${p}</h2>
        <div class="score">Score: $0</div>
        <div class="stats">0 ✔ | 0 ✖</div>
      </div>`);
  }
  updateStats();
}

function resetBoard() {
  $active.empty();
  $hintBtn.addClass("disabled");
  $timer.text("Time Left: --");
  $("#categories, tbody").empty();
  $play.text("Loading...");
}

async function loadGame() {
  // Purposeful spinner stages
  $spinner.removeClass("disabled");
  $spinTxt.text("Fetching categories…");
  const ids = await fetchCategoryIds();

  $spinTxt.text("Fetching clues…");
  categories = await Promise.all(ids.map(fetchCategoryData));

  $spinTxt.text("Building board…");
  buildBoard();

  $spinner.addClass("disabled");
  $play.text("Restart the Game!");
}

async function fetchCategoryIds() {
  const res = await axios.get(`${API_URL}categories?count=100`);
  const valid = res.data.filter(c => c.clues_count >= NCLUE);
  const out = [], used = new Set();
  while (out.length < NCAT && valid.length) {
    const { id } = _.sample(valid);
    if (!used.has(id)) {
      used.add(id);
      out.push(id);
    }
  }
  return out;
}

async function fetchCategoryData(cid) {
  const res = await axios.get(`${API_URL}category?id=${cid}`);
  let all = res.data.clues.filter(c => c.question && c.answer);
  // Difficulty filters
  all = all.filter((c,i) => {
    const v = (i+1)*100;
    return difficulty==="easy"   ? v<=200
         : difficulty==="medium" ? v>200&&v<=400
         :                        v>400;
  });
  return {
    id: cid,
    title: res.data.title,
    clues: all.slice(0, NCLUE).map((c,i) => ({
      id: c.id, value: (i+1)*100, question: c.question, answer: c.answer
    }))
  };
}

function buildBoard() {
  const $head = $("#categories"), $body = $("tbody").empty();
  categories.forEach(c => $head.append(`<th id="hdr${c.id}">${c.title}</th>`));
  for (let i = 0; i < NCLUE; i++) {
    const $r = $("<tr>");
    categories.forEach(c => {
      const clue = c.clues[i];
      $r.append(`<td class="clue" id="${c.id}-${clue.id}">$${clue.value}</td>`);
    });
    $body.append($r);
  }
}

$(document).on("click", ".clue", selectClue);

function selectClue(evt) {
  if (mode) return;
  const [cid, clid] = evt.target.id.split("-").map(Number);
  // Remove clue from data & lock column if empty
  categories.forEach((cat, i) => {
    if (cat.id===cid) {
      const idx = cat.clues.findIndex(x=>x.id===clid);
      activeClue = cat.clues.splice(idx,1)[0];
      if (!cat.clues.length) $(`#hdr${cid}, #${cid}-*`).addClass("locked");
    }
  });

  $(evt.target).addClass("viewed");
  $active.text(activeClue.question);
  $input.val("").show();
  $submit.show();
  $hintBtn.toggleClass("disabled", hintsUsed[curr]);

  startTimer();
  mode = 1;
}

function startTimer() {
  clearInterval(timer);
  timeLeft = difficulty==="easy"?15: difficulty==="medium"?10:7;
  $timer.text(`Time Left: ${timeLeft}`);
  timer = setInterval(() => {
    if (--timeLeft <= 0) {
      clearInterval(timer);
      endTurn("Time's up!");
    } else {
      $timer.text(`Time Left: ${timeLeft}`);
    }
  }, 1000);
}

function validateAnswer() {
  clearInterval(timer);
  const ua = $input.val().trim().toLowerCase();
  const ca = activeClue.answer.trim().toLowerCase();
  if (ua === ca) {
    stats[curr].score += activeClue.value;
    stats[curr].correct++;
    endTurn("Correct! 🎉");
  } else {
    stats[curr].wrong++;
    endTurn(`Wrong! Ans: ${activeClue.answer}`);
  }
}

function endTurn(msg) {
  $active.text(msg);
  $input.hide();
  $submit.hide();
  updateStats();
  mode = 0;
  // Check for end or next player
  if (categories.every(c=>!c.clues.length)) {
    canPlay = true;
    $play.text("Restart the Game!");
    $active.append("<p>The End!</p>");
  } else {
    curr = curr % numPlayers + 1;
    updateStats();
  }
}

function showHint() {
  if (hintsUsed[curr]) return;
  const first = activeClue.answer.trim()[0].toUpperCase();
  $active.append(`<p class="hint">Hint: starts with “${first}”</p>`);
  hintsUsed[curr] = true;
  $hintBtn.addClass("disabled");
}

function updateStats() {
  for (let p = 1; p <= numPlayers; p++) {
    $(`#p${p} .score`).text(`Score: $${stats[p].score}`);
    $(`#p${p} .stats`).text(`${stats[p].correct} ✔ | ${stats[p].wrong} ✖`);
  }
  $(".player-stats").removeClass("active");
  $(`#p${curr}`).addClass("active");
}
