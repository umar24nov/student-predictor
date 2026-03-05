import { useState, useEffect } from "react";

const API_URL = "http://127.0.0.1:8000";

/* ─── Scroll helper ─────────────────────────── */
function smoothScrollTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: "smooth" });
}

/* ─── ML helpers ────────────────────────────── */
const boardToScore = v => ({ above90:180,b75_90:155,b60_75:130,b45_60:105,below45:75 }[v]??130);
const semGrade     = v => ({ excellent:17,good:14,average:11,below:8,failed:4 }[v]??11);
const semApproved  = (v,e=6) => ({ excellent:e,good:Math.round(e*.9),average:Math.round(e*.7),below:Math.round(e*.5),failed:Math.round(e*.2) }[v]??Math.round(e*.7));
const attRate      = v => ({ always:.95,mostly:.80,sometimes:.60,rarely:.35 }[v]??.75);
const parentEdu    = v => ({ phd:5,masters:4,bachelors:3,diploma:2,highschool:1,middle:19,primary:38,none:35 }[v]??1);
const parentJob    = v => ({ professional:2,teacher:2,govt:4,business:5,labour:7,farmer:6,homemaker:9,other:9 }[v]??9);
const admMode      = v => ({ merit:1,entrance:39,quota:7,transfer:42,private:17,management:44 }[v]??1);
const feeFields    = v => ({ family:{debtor:0,tuition:1,scholarship:0},scholarship:{debtor:0,tuition:1,scholarship:1},loan:{debtor:1,tuition:1,scholarship:0},self:{debtor:0,tuition:1,scholarship:0},pending:{debtor:1,tuition:0,scholarship:0},struggling:{debtor:1,tuition:0,scholarship:0} }[v]??{debtor:0,tuition:1,scholarship:0});
const skillsBoost  = s => Math.min(15,(s?.length||0)*3);
function semTrend(scores){ const v=scores.map(semGrade); if(v.length<2)return 0; const d=v[v.length-1]-v[0]; return d>2?1:d<-2?-1:0; }

function buildPayload(a) {
  const att=attRate(a.attendance), e=6;
  const prev=Math.round((boardToScore(a.tenthScore??"b60_75")+boardToScore(a.twelfthScore??"b60_75"))/2);
  const sem=parseInt(a.currentSem)||1;
  const ss=Array.from({length:Math.min(sem-1,8)},(_,i)=>a[`sem${i+1}Score`]||"average");
  const trend=semTrend(ss);
  const g1=Math.min(20,(ss[0]?semGrade(ss[0]):prev/10)+trend*.5);
  const g2=Math.min(20,(ss[1]?semGrade(ss[1]):g1)+trend*.5);
  const apr1=ss[0]?semApproved(ss[0],e):Math.round(e*att);
  const apr2=ss[1]?semApproved(ss[1],e):Math.round(e*att);
  const fees=feeFields(a.feeSource??"family");
  return {
    marital_status:1,application_mode:admMode(a.admissionType??"merit"),application_order:1,course:9147,
    daytime_evening_attendance:a.classTime==="evening"?0:1,previous_qualification:1,previous_qualification_grade:prev,
    nacionality:1,mothers_qualification:parentEdu(a.momEdu??"highschool"),fathers_qualification:parentEdu(a.dadEdu??"highschool"),
    mothers_occupation:parentJob(a.momJob??"other"),fathers_occupation:parentJob(a.dadJob??"other"),
    admission_grade:Math.min(200,prev+skillsBoost(a.skills)),displaced:a.living==="home"?0:1,
    educational_special_needs:0,debtor:fees.debtor,tuition_fees_up_to_date:fees.tuition,
    gender:a.gender==="male"?1:0,scholarship_holder:fees.scholarship,age_at_enrollment:parseInt(a.age)||20,international:0,
    curricular_units_1st_sem_credited:0,curricular_units_1st_sem_enrolled:e,
    curricular_units_1st_sem_evaluations:Math.round(e*att*1.1),curricular_units_1st_sem_approved:apr1,
    curricular_units_1st_sem_grade:parseFloat(g1.toFixed(2)),curricular_units_1st_sem_without_evaluations:Math.round(e*(1-att)),
    curricular_units_2nd_sem_credited:0,curricular_units_2nd_sem_enrolled:e,
    curricular_units_2nd_sem_evaluations:Math.round(e*att*1.1),curricular_units_2nd_sem_approved:apr2,
    curricular_units_2nd_sem_grade:parseFloat(g2.toFixed(2)),curricular_units_2nd_sem_without_evaluations:Math.round(e*(1-att)),
    unemployment_rate:10.8,inflation_rate:1.4,gdp:1.74,
  };
}

async function saveResponseData(ans, result) {
  try {
    await fetch(`${API_URL}/save-response`,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({answers:ans,prediction:result.prediction,confidence:result.confidence,confidence_scores:result.confidence_scores,timestamp:new Date().toISOString()})});
  } catch(_){}
}

/* ─── Questions ─────────────────────────────── */
function buildQuestions(answers) {
  const sem=parseInt(answers.currentSem)||1;
  return [
    {id:"gender",section:"About You",icon:"👤",q:"Let's start — what's your gender?",type:"choice",cols:3,
      options:[{value:"male",label:"Male",emoji:"👦"},{value:"female",label:"Female",emoji:"👧"},{value:"other",label:"Other",emoji:"🙂"}]},
    {id:"age",section:"About You",icon:"🎂",q:"How old are you?",type:"number",min:15,max:60,placeholder:"e.g. 20"},
    {id:"tenthScore",section:"School Scores",icon:"📝",q:"What were your 10th board exam scores?",hint:"Pick the range closest to your overall percentage",type:"choice",cols:2,
      options:[{value:"above90",label:"Above 90%",emoji:"🏆"},{value:"b75_90",label:"75% – 90%",emoji:"⭐"},{value:"b60_75",label:"60% – 75%",emoji:"👌"},{value:"b45_60",label:"45% – 60%",emoji:"😅"},{value:"below45",label:"Below 45%",emoji:"😓"}]},
    {id:"twelfthScore",section:"School Scores",icon:"📋",q:"What were your 12th / Intermediate scores?",hint:"Your most recent pre-college qualification",type:"choice",cols:2,
      options:[{value:"above90",label:"Above 90%",emoji:"🏆"},{value:"b75_90",label:"75% – 90%",emoji:"⭐"},{value:"b60_75",label:"60% – 75%",emoji:"👌"},{value:"b45_60",label:"45% – 60%",emoji:"😅"},{value:"below45",label:"Below 45%",emoji:"😓"}]},
    {id:"currentSem",section:"College Journey",icon:"📅",q:"Which semester are you currently in?",hint:"Most courses have 6–8 semesters total",type:"choice",cols:4,
      options:[1,2,3,4,5,6,7,8].map(n=>({value:String(n),label:`Sem ${n}`,emoji:n<=2?"🌱":n<=4?"📚":n<=6?"💡":"🎓"}))},
    {id:"classTime",section:"College Journey",icon:"🕐",q:"When do you attend your classes?",type:"choice",cols:2,
      options:[{value:"daytime",label:"Daytime",emoji:"☀️"},{value:"evening",label:"Evening / Night",emoji:"🌙"}]},
    {id:"attendance",section:"College Journey",icon:"✅",q:"Be honest — how's your class attendance?",type:"choice",cols:2,
      options:[{value:"always",label:"Almost always (90%+)",emoji:"🌟"},{value:"mostly",label:"Mostly there (75–90%)",emoji:"👍"},{value:"sometimes",label:"Sometimes (50–75%)",emoji:"😐"},{value:"rarely",label:"Rarely attend (<50%)",emoji:"😬"}]},
    ...Array.from({length:Math.min(sem-1,8)},(_,i)=>({
      id:`sem${i+1}Score`,section:"Semester Scores",icon:"📊",
      q:`How did you perform in Semester ${i+1}?`,hint:"Overall result across all subjects",
      type:"choice",cols:2,
      options:[{value:"excellent",label:"Excellent (85%+)",emoji:"🌟"},{value:"good",label:"Good (70–85%)",emoji:"👍"},{value:"average",label:"Average (55–70%)",emoji:"📘"},{value:"below",label:"Below avg (40–55%)",emoji:"😐"},{value:"failed",label:"Failed some subjects",emoji:"😓"}],
    })),
    {id:"skills",section:"Your Skills",icon:"💡",q:"What are you genuinely good at?",hint:"Pick all that apply",type:"multi",
      options:[{value:"maths",label:"Mathematics",emoji:"🔢"},{value:"science",label:"Science / Physics",emoji:"🔬"},{value:"coding",label:"Coding / Tech",emoji:"💻"},{value:"english",label:"English / Writing",emoji:"✍️"},{value:"stats",label:"Statistics / Data",emoji:"📈"},{value:"economics",label:"Economics / Finance",emoji:"💹"},{value:"law",label:"Law / Civics",emoji:"⚖️"},{value:"arts",label:"Arts / Design",emoji:"🎨"},{value:"sports",label:"Sports / Fitness",emoji:"⚽"},{value:"leadership",label:"Leadership / Comm",emoji:"🎤"},{value:"languages",label:"Languages",emoji:"🌐"},{value:"research",label:"Research / Analysis",emoji:"🔍"}]},
    {id:"living",section:"Life & Finance",icon:"🏠",q:"Where are you currently living?",type:"choice",cols:2,
      options:[{value:"home",label:"At home with family",emoji:"🏡"},{value:"hostel",label:"College Hostel",emoji:"🏢"},{value:"pg",label:"PG / Rented room",emoji:"🛏️"},{value:"relative",label:"Relative's place",emoji:"👨‍👩‍👧"}]},
    {id:"feeSource",section:"Life & Finance",icon:"💳",q:"How do you fund your college education?",hint:"Financial stress is a real academic factor",type:"choice",cols:2,
      options:[{value:"family",label:"Family pays fully",emoji:"👨‍👩‍👧"},{value:"scholarship",label:"Scholarship / Govt grant",emoji:"🏅"},{value:"loan",label:"Education Loan",emoji:"🏦"},{value:"self",label:"Self-earning / Part-time job",emoji:"💼"},{value:"pending",label:"Fees often pending / late",emoji:"⏳"},{value:"struggling",label:"Financially struggling",emoji:"😟"}]},
    {id:"admissionType",section:"Life & Finance",icon:"🎟️",q:"How did you get admission to this college?",type:"choice",cols:2,
      options:[{value:"merit",label:"Merit / Academic score",emoji:"📊"},{value:"entrance",label:"Entrance exam (JEE/NEET etc)",emoji:"📝"},{value:"quota",label:"Reservation / Quota",emoji:"📋"},{value:"management",label:"Management / NRI quota",emoji:"🏛️"},{value:"transfer",label:"Lateral entry / Transfer",emoji:"🔄"},{value:"private",label:"Private / Self-funded univ",emoji:"🏫"}]},
    {id:"momEdu",section:"Family Background",icon:"👩",q:"What is your mother's highest education?",type:"choice",cols:2,
      options:[{value:"phd",label:"PhD / Doctorate",emoji:"🎓"},{value:"masters",label:"Master's Degree",emoji:"📜"},{value:"bachelors",label:"Bachelor's Degree",emoji:"🏫"},{value:"diploma",label:"Diploma / Polytechnic",emoji:"📋"},{value:"highschool",label:"12th / High School",emoji:"📚"},{value:"middle",label:"Up to 10th",emoji:"📖"},{value:"none",label:"No formal education",emoji:"🙏"}]},
    {id:"dadEdu",section:"Family Background",icon:"👨",q:"What is your father's highest education?",type:"choice",cols:2,
      options:[{value:"phd",label:"PhD / Doctorate",emoji:"🎓"},{value:"masters",label:"Master's Degree",emoji:"📜"},{value:"bachelors",label:"Bachelor's Degree",emoji:"🏫"},{value:"diploma",label:"Diploma / Polytechnic",emoji:"📋"},{value:"highschool",label:"12th / High School",emoji:"📚"},{value:"middle",label:"Up to 10th",emoji:"📖"},{value:"none",label:"No formal education",emoji:"🙏"}]},
    {id:"dadJob",section:"Family Background",icon:"💼",q:"What does your father do professionally?",type:"choice",cols:2,
      options:[{value:"professional",label:"Doctor / Engineer / Lawyer",emoji:"👨‍⚕️"},{value:"teacher",label:"Teacher / Professor",emoji:"👨‍🏫"},{value:"govt",label:"Government / Defence",emoji:"🏛️"},{value:"business",label:"Business / Self-employed",emoji:"💼"},{value:"farmer",label:"Farmer / Agriculture",emoji:"🌾"},{value:"labour",label:"Labour / Factory work",emoji:"🔧"},{value:"other",label:"Other / Retired",emoji:"👤"}]},
  ];
}

/* ─── Shared UI atoms ───────────────────────── */
function PageShell({ children, onBack }) {
  return (
    <div className="relative z-10 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <button onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-8 transition-colors">
          ← Back to Home
        </button>
        {children}
      </div>
    </div>
  );
}

function SectionTag({ color="blue", children }) {
  const colors = {
    blue:   "text-blue-400 bg-blue-500/10 border-blue-500/20",
    violet: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    emerald:"text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };
  return (
    <span className={`inline-block text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full border ${colors[color]}`}>
      {children}
    </span>
  );
}

/* ─── STAR RATING ───────────────────────────── */
function StarRating({ rating, setRating, hovering, setHovering }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(s => (
        <button key={s}
          onClick={() => setRating(s)}
          onMouseEnter={() => setHovering(s)}
          onMouseLeave={() => setHovering(0)}
          className="text-3xl transition-all duration-100 hover:scale-110">
          <span className={(hovering||rating)>=s ? "text-yellow-400" : "text-slate-600"}>★</span>
        </button>
      ))}
    </div>
  );
}

/* ─── RATE US PAGE ──────────────────────────── */
function RateUsPage({ onBack }) {
  const [rating, setRating]   = useState(0);
  const [hovering, setHovering] = useState(0);
  const [msg, setMsg]         = useState("");
  const [name, setName]       = useState("");
  const [submitted, setSubmitted] = useState(false);

  const labels = ["","Terrible 😞","Not great 😕","Okay 😐","Good 👍","Excellent 🌟"];

  function handleSubmit() {
    if (!rating) return;
    // TODO: connect to Firebase — for now just show success
    setSubmitted(true);
  }

  if (submitted) return (
    <PageShell onBack={onBack}>
      <div className="bg-[#0d1220] border border-white/8 rounded-3xl p-10 sm:p-14 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="font-display text-3xl font-extrabold mb-3">Thank You!</h2>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">Your {rating}-star rating has been recorded. Your feedback helps us improve ProgressAI for every student.</p>
        <div className="flex justify-center gap-1 mt-6">
          {[1,2,3,4,5].map(s=>(
            <span key={s} className={`text-2xl ${s<=rating?"text-yellow-400":"text-slate-700"}`}>★</span>
          ))}
        </div>
        <button onClick={onBack} className="mt-8 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 text-sm font-bold hover:-translate-y-0.5 transition-all">
          Back to Home
        </button>
      </div>
    </PageShell>
  );

  return (
    <PageShell onBack={onBack}>
      <div className="mb-8">
        <SectionTag color="violet">Rate Us</SectionTag>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 mb-2 tracking-tight">How Was Your Experience?</h1>
        <p className="text-slate-400 text-sm">Your feedback helps us make ProgressAI better for every student.</p>
      </div>

      <div className="bg-[#0d1220] border border-white/8 rounded-3xl p-6 sm:p-8 space-y-6">
        {/* Stars */}
        <div>
          <p className="text-sm font-semibold mb-3 text-slate-300">Overall Rating <span className="text-red-400">*</span></p>
          <StarRating rating={rating} setRating={setRating} hovering={hovering} setHovering={setHovering} />
          {(hovering||rating) > 0 && (
            <p className="text-sm text-slate-400 mt-2">{labels[hovering||rating]}</p>
          )}
        </div>

        {/* Name (optional) */}
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">Your Name <span className="text-slate-600 font-normal">(optional)</span></label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Rohan Sharma"
            className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors" />
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">Your Feedback <span className="text-slate-600 font-normal">(optional)</span></label>
          <textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={4}
            placeholder="Tell us what you liked, what could be better, or any features you'd love to see..."
            className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors resize-none" />
        </div>

        {/* Categories */}
        <div>
          <p className="text-sm font-semibold text-slate-300 mb-3">What did you like most? <span className="text-slate-600 font-normal">(optional)</span></p>
          <div className="flex flex-wrap gap-2">
            {["Accuracy","Easy to use","Question design","Speed","Result clarity","Mobile friendly"].map(t => (
              <button key={t} className="px-3 py-1.5 rounded-full border border-white/10 text-xs text-slate-400 hover:border-blue-500/50 hover:text-blue-300 transition-all bg-white/3">
                {t}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleSubmit} disabled={!rating}
          className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all
            ${rating ? "bg-gradient-to-r from-blue-500 to-violet-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/30" : "bg-white/5 text-slate-600 cursor-not-allowed"}`}>
          {rating ? `Submit ${rating}-Star Rating ★` : "Please select a rating first"}
        </button>

        <p className="text-xs text-slate-600 text-center">Your feedback is anonymous unless you provide your name.</p>
      </div>
    </PageShell>
  );
}

/* ─── ABOUT PAGE ────────────────────────────── */
function AboutPage({ onBack }) {
  return (
    <PageShell onBack={onBack}>
      <div className="mb-8">
        <SectionTag color="blue">About</SectionTag>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 tracking-tight">About ProgressAI</h1>
      </div>
      <div className="bg-[#0d1220] border border-white/8 rounded-3xl overflow-hidden">
        <div className="bg-gradient-to-br from-blue-950 to-violet-950 p-10 text-center">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-4xl mx-auto mb-5">👨‍💻</div>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold mb-1">Mohammad Umar</h2>
          <p className="text-blue-300 font-semibold text-sm tracking-wide">B.Tech — Computer Science & Engineering</p>
        </div>
        <div className="p-6 sm:p-10 space-y-7">
          <div>
            <h3 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-3">About the Creator</h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              Hi! I'm Mohammad Umar, a B.Tech CSE student passionate about Machine Learning and building tools that genuinely help people. I built <strong className="text-white">ProgressAI</strong> as a full-stack ML project — covering data collection, model training, and a complete web app — to help students understand where they stand academically and what they can do about it.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-3">About ProgressAI</h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              ProgressAI uses a Random Forest ML model trained on real data from 4,424 students to predict academic outcomes — Graduate, Enrolled, or Dropout. It analyses 36 factors including attendance, semester scores, financial situation, and family background.
            </p>
            <p className="text-slate-300 text-sm leading-relaxed mt-3">
              Every response is anonymously collected to continuously retrain the model. The more students use it, the smarter it gets.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-3">Tech Stack</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[["⚛️","React.js","Frontend"],["🎨","Tailwind CSS","Styling"],["🐍","FastAPI","Backend"],["🤖","scikit-learn","ML Library"],["🌲","Random Forest","Algorithm"],["📊","Python","Data Science"]].map(([e,n,r])=>(
                <div key={n} className="bg-white/4 border border-white/8 rounded-xl p-3 text-center hover:border-white/15 transition-all">
                  <div className="text-2xl mb-1">{e}</div>
                  <div className="text-sm font-bold">{n}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{r}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-3">Connect with Me</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <a href="https://github.com/umar24nov" target="_blank" rel="noreferrer"
                className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl px-4 py-3 text-sm font-medium hover:border-white/20 hover:bg-white/8 transition-all">
                <span className="text-xl">🐙</span><div><div className="font-bold">GitHub</div><div className="text-xs text-slate-500">github.com/umar24nov</div></div>
              </a>
              <a href="https://www.linkedin.com/in/mohammadumarfarook" target="_blank" rel="noreferrer"
                className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl px-4 py-3 text-sm font-medium hover:border-white/20 hover:bg-white/8 transition-all">
                <span className="text-xl">💼</span><div><div className="font-bold">LinkedIn</div><div className="text-xs text-slate-500">mohammadumarfarook</div></div>
              </a>
              <a href="mailto:umar24nov@gmail.com"
                className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl px-4 py-3 text-sm font-medium hover:border-white/20 hover:bg-white/8 transition-all">
                <span className="text-xl">📧</span><div><div className="font-bold">Email</div><div className="text-xs text-slate-500">umar24nov@gmail.com</div></div>
              </a>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

/* ─── PRIVACY POLICY ────────────────────────── */
function PrivacyPage({ onBack }) {
  const sections = [
    ["What data do we collect?","When you complete the prediction quiz, we collect your anonymised academic profile — including semester performance, attendance, financial situation, and family background. We do NOT collect your name, email, phone number, or any personally identifiable information."],
    ["Why do we collect it?","Your anonymised responses are used to retrain and improve ProgressAI's machine learning model. More data = better predictions for all students."],
    ["How is data stored?","Responses are stored in a secure file on our server. Each entry contains only your academic answers and prediction result — no identity information whatsoever."],
    ["Do we share your data?","No. We do not sell, share, or distribute your data to any third party. Data is used solely for internal model improvement."],
    ["Your rights","Since we don't collect personal identifiers, we cannot link a response back to you. If you have concerns, contact us at umar24nov@gmail.com."],
    ["Contact","For any privacy-related queries: umar24nov@gmail.com"],
  ];
  return (
    <PageShell onBack={onBack}>
      <div className="mb-8">
        <SectionTag color="violet">Legal</SectionTag>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 tracking-tight">Privacy Policy</h1>
        <p className="text-slate-500 text-xs mt-2">Last updated: March 2025</p>
      </div>
      <div className="bg-[#0d1220] border border-white/8 rounded-3xl p-6 sm:p-10">
        {sections.map(([t,d],i)=>(
          <div key={t} className={`${i>0?"border-t border-white/6 pt-6 mt-6":""}`}>
            <h3 className="font-bold text-base text-white mb-2">{t}</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{d}</p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

/* ─── TERMS OF USE ──────────────────────────── */
function TermsPage({ onBack }) {
  const sections = [
    ["Acceptance","By using ProgressAI, you agree to these terms. If you disagree, please do not use the service."],
    ["Nature of predictions","ProgressAI provides AI-generated predictions for informational purposes only. Predictions are based on statistical patterns and should NOT be treated as definitive academic advice. Always consult your college counselor for serious academic decisions."],
    ["Data consent","By submitting the quiz, you consent to your anonymised responses being stored and used to improve our AI model, as described in our Privacy Policy."],
    ["No guarantees","We do not guarantee prediction accuracy. The model has a 77.6% accuracy rate — meaning roughly 1 in 4 predictions may be incorrect. Use results as a guide, not a final verdict."],
    ["Free service","ProgressAI is free to use. We reserve the right to introduce optional features in the future."],
    ["Changes","We may update these terms at any time. Continued use implies acceptance of the latest terms."],
  ];
  return (
    <PageShell onBack={onBack}>
      <div className="mb-8">
        <SectionTag color="violet">Legal</SectionTag>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 tracking-tight">Terms of Use</h1>
        <p className="text-slate-500 text-xs mt-2">Last updated: March 2025</p>
      </div>
      <div className="bg-[#0d1220] border border-white/8 rounded-3xl p-6 sm:p-10">
        {sections.map(([t,d],i)=>(
          <div key={t} className={`${i>0?"border-t border-white/6 pt-6 mt-6":""}`}>
            <h3 className="font-bold text-base text-white mb-2">{t}</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{d}</p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

/* ─── CONTACT PAGE ──────────────────────────── */
function ContactPage({ onBack }) {
  const [form, setForm]       = useState({ name:"", email:"", subject:"", message:"" });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  function update(k, v) { setForm(p=>({...p,[k]:v})); }
  const valid = form.name && form.email && form.subject && form.message;

  async function handleSubmit() {
    if (!valid) return;
    setSending(true);
    // TODO: Replace with Firebase Firestore call
    // e.g. await addDoc(collection(db, "contacts"), { ...form, timestamp: serverTimestamp() });
    await new Promise(r => setTimeout(r, 1000)); // simulate
    setSubmitted(true);
    setSending(false);
  }

  if (submitted) return (
    <PageShell onBack={onBack}>
      <div className="bg-[#0d1220] border border-white/8 rounded-3xl p-10 sm:p-14 text-center">
        <div className="text-5xl mb-4">📬</div>
        <h2 className="font-display text-2xl font-extrabold mb-2">Message Received!</h2>
        <p className="text-slate-400 text-sm max-w-xs mx-auto">Thanks for reaching out. I'll get back to you within 48 hours at <strong className="text-slate-200">{form.email}</strong>.</p>
        <button onClick={onBack} className="mt-8 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 text-sm font-bold hover:-translate-y-0.5 transition-all">
          Back to Home
        </button>
      </div>
    </PageShell>
  );

  return (
    <PageShell onBack={onBack}>
      <div className="mb-8">
        <SectionTag color="emerald">Get in Touch</SectionTag>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 tracking-tight">Contact Me</h1>
        <p className="text-slate-400 text-sm mt-2">Questions, suggestions, or just want to say hi? I'd love to hear from you.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          {icon:"📧",label:"Email",val:"umar24nov@gmail.com",href:"mailto:umar24nov@gmail.com"},
          {icon:"🐙",label:"GitHub",val:"github.com/umar24nov",href:"https://github.com/umar24nov"},
          {icon:"💼",label:"LinkedIn",val:"mohammadumarfarook",href:"https://www.linkedin.com/in/mohammadumarfarook"},
        ].map(c=>(
          <a key={c.label} href={c.href} target="_blank" rel="noreferrer"
            className="flex items-center gap-3 bg-[#0d1220] border border-white/8 rounded-2xl px-4 py-3.5 hover:border-white/20 transition-all">
            <span className="text-2xl shrink-0">{c.icon}</span>
            <div><div className="text-xs font-bold uppercase tracking-wide text-slate-400">{c.label}</div><div className="text-xs text-slate-300 mt-0.5 truncate">{c.val}</div></div>
          </a>
        ))}
      </div>

      <div className="bg-[#0d1220] border border-white/8 rounded-3xl p-6 sm:p-8 space-y-5">
        <h3 className="font-bold text-base">Send a Message</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Your Name <span className="text-red-400">*</span></label>
            <input value={form.name} onChange={e=>update("name",e.target.value)} placeholder="Mohammad Umar"
              className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Your Email <span className="text-red-400">*</span></label>
            <input type="email" value={form.email} onChange={e=>update("email",e.target.value)} placeholder="you@email.com"
              className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Subject <span className="text-red-400">*</span></label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {["Bug Report","Feature Request","General Query","Feedback"].map(s=>(
              <button key={s} onClick={()=>update("subject",s)}
                className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all
                  ${form.subject===s?"border-blue-500 bg-blue-500/10 text-blue-300":"border-white/10 text-slate-400 hover:border-white/20"}`}>
                {s}
              </button>
            ))}
          </div>
          <input value={form.subject} onChange={e=>update("subject",e.target.value)} placeholder="Or type a custom subject..."
            className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors" />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Message <span className="text-red-400">*</span></label>
          <textarea rows={5} value={form.message} onChange={e=>update("message",e.target.value)}
            placeholder="Write your message here..."
            className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-blue-500 transition-colors resize-none" />
        </div>

        <button onClick={handleSubmit} disabled={!valid||sending}
          className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all
            ${valid&&!sending?"bg-gradient-to-r from-blue-500 to-violet-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/30":"bg-white/5 text-slate-600 cursor-not-allowed"}`}>
          {sending ? "Sending…" : valid ? "Send Message →" : "Fill all required fields"}
        </button>
        <p className="text-xs text-slate-600 text-center">
          {/* TODO: Connect to Firebase — store in Firestore 'contacts' collection */}
          Firebase integration coming soon. Currently simulated.
        </p>
      </div>
    </PageShell>
  );
}

/* ─── STUDY TIPS PAGE ───────────────────────── */
function StudyTipsPage({ onBack }) {
  return (
    <PageShell onBack={onBack}>
      <div className="mb-8">
        <SectionTag color="emerald">Resources</SectionTag>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 tracking-tight">Study Tips</h1>
        <p className="text-slate-400 text-sm mt-2">Evidence-based tips to help you stay on track and graduate with confidence.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          ["✅","Attend every class","Attendance is the single strongest predictor of academic success. Even unprepared, showing up matters more than you think."],
          ["📅","Plan your semester early","In week 1, map out all deadlines and exam dates. Students who plan ahead are far less likely to fall behind."],
          ["💸","Sort your fees first","Financial stress is a top dropout risk. Apply for scholarships, education loans, or fee waivers before the semester begins."],
          ["👥","Form a study group","Students who study in groups perform 15–20% better on average. Find 2–3 classmates and meet weekly."],
          ["🎯","Focus on weak subjects","Don't just study what you enjoy. Identify your weakest subject each semester and dedicate extra time early."],
          ["🧠","Sleep before exams","All-nighters hurt more than they help. 7–8 hours of sleep consistently outperforms last-minute cramming."],
          ["🏃","Stay physically active","Even 20 minutes of walking daily reduces stress and improves focus. Your body and brain are deeply connected."],
          ["🗣️","Talk to your counselor","If you're struggling — financially, academically, or personally — visit your college counselor early. The sooner the better."],
        ].map(([icon,title,desc])=>(
          <div key={title} className="bg-[#0d1220] border border-white/8 rounded-2xl p-5 hover:border-white/15 hover:-translate-y-0.5 transition-all">
            <div className="text-2xl mb-3">{icon}</div>
            <h3 className="font-bold text-sm mb-1.5 text-white">{title}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

/* ─── ATTENDANCE GUIDE PAGE ─────────────────── */
function AttendancePage({ onBack }) {
  return (
    <PageShell onBack={onBack}>
      <div className="mb-8">
        <SectionTag color="emerald">Resources</SectionTag>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 tracking-tight">Attendance Guide</h1>
        <p className="text-slate-400 text-sm mt-2">Why attendance matters and how to improve it.</p>
      </div>
      <div className="space-y-4">
        {[
          ["📊","The 75% Rule","Most Indian colleges require a minimum 75% attendance to sit for exams. Below this, you may be barred from appearing — regardless of how well you study."],
          ["🎯","Why it predicts outcomes","Our ML model found attendance to be one of the top 5 predictors of dropout. Students with <50% attendance are 3x more likely to drop out or fail."],
          ["📱","Track it daily","Use your college portal or a simple notes app to track each class. Don't wait until the end of semester to realize you've crossed the limit."],
          ["🤝","Inform beforehand","If you must miss class, inform the teacher in advance. Most professors are flexible for students who communicate proactively."],
          ["💡","Proxy won't help","Attendance proxies create short-term relief but long-term problems — you miss the actual content, which shows up in your grades."],
          ["🔄","Recovery strategy","If you're already below 75%, calculate exactly how many consecutive classes you need to attend to recover. Most colleges allow medical leave exceptions."],
        ].map(([icon,title,desc])=>(
          <div key={title} className="bg-[#0d1220] border border-white/8 rounded-2xl p-5 hover:border-white/15 transition-all flex gap-4">
            <div className="text-2xl shrink-0">{icon}</div>
            <div><h3 className="font-bold text-sm mb-1 text-white">{title}</h3><p className="text-xs text-slate-400 leading-relaxed">{desc}</p></div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

/* ─── SCHOLARSHIP PAGE ──────────────────────── */
function ScholarshipPage({ onBack }) {
  return (
    <PageShell onBack={onBack}>
      <div className="mb-8">
        <SectionTag color="blue">Resources</SectionTag>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 tracking-tight">Scholarship Info</h1>
        <p className="text-slate-400 text-sm mt-2">Major scholarships available to Indian students.</p>
      </div>
      <div className="space-y-4">
        {[
          ["🏛️","NSP — National Scholarship Portal","India's biggest scholarship platform. Covers pre-matric, post-matric, and merit-cum-means scholarships from central and state governments.","scholarships.gov.in"],
          ["🎓","AICTE Pragati Scholarship","For girl students in AICTE-approved technical institutes. ₹50,000/year + contingency.","aicte-india.org"],
          ["💡","Inspire Scholarship (DST)","For students pursuing basic science at BSc/Integrated MSc level. ₹80,000/year for top 1% in board exams.","online-inspire.gov.in"],
          ["🌿","PM Scholarship Scheme","For children of ex-servicemen. ₹2,500–3,000/month for 4–5 years.","ksb.gov.in"],
          ["📚","Vidyasaarathi Portal","Industry-funded scholarships from top corporates (TCS, Infosys, HDFC etc). Multiple rounds per year.","vidyasaarathi.co.in"],
          ["🏅","State Government Schemes","Every state has its own scholarship for SC/ST/OBC and minority students. Check your state's social welfare department website.",""],
        ].map(([icon,title,desc,link])=>(
          <div key={title} className="bg-[#0d1220] border border-white/8 rounded-2xl p-5 hover:border-white/15 transition-all">
            <div className="flex items-start gap-4">
              <div className="text-2xl shrink-0">{icon}</div>
              <div className="flex-1">
                <h3 className="font-bold text-sm mb-1 text-white">{title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-2">{desc}</p>
                {link && <a href={`https://${link}`} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">{link} →</a>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

/* ─── COUNSELING PAGE ───────────────────────── */
function CounselingPage({ onBack }) {
  return (
    <PageShell onBack={onBack}>
      <div className="mb-8">
        <SectionTag color="violet">Resources</SectionTag>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 tracking-tight">Counseling Help</h1>
        <p className="text-slate-400 text-sm mt-2">You don't have to figure it out alone. Here's how to get help.</p>
      </div>
      <div className="space-y-4">
        {[
          ["🧠","iCall (TISS)","Free mental health counseling helpline run by Tata Institute of Social Sciences. Available for students across India.","9152987821"],
          ["💬","Vandrevala Foundation","24x7 mental health helpline. Free, confidential, and available in English and Hindi.","1860-2662-345"],
          ["🎓","Your College Counselor","Every UGC-recognized college must have a student counseling cell. Visit them — they handle academic, financial, and personal issues.",""],
          ["📞","iYouth","India's youth helpline for career and academic guidance. Free calls, available weekdays.","8800444888"],
          ["💡","What to discuss?","Academic struggles, attendance issues, fee problems, exam anxiety, family pressure, career confusion — all are valid reasons to seek counseling.",""],
        ].map(([icon,title,desc,contact])=>(
          <div key={title} className="bg-[#0d1220] border border-white/8 rounded-2xl p-5 hover:border-white/15 transition-all flex gap-4">
            <div className="text-2xl shrink-0">{icon}</div>
            <div>
              <h3 className="font-bold text-sm mb-1 text-white">{title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
              {contact && <p className="text-sm font-bold text-blue-400 mt-1.5">📞 {contact}</p>}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

/* ─── NAVBAR ────────────────────────────────── */
function Navbar({ page, onHome, onStartQuiz, onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false);

  function handleNavClick(id) {
    setMenuOpen(false);
    if (page !== "home") { onHome(); setTimeout(() => smoothScrollTo(id), 150); }
    else smoothScrollTo(id);
  }

  return (
    <nav className="sticky top-0 z-50 bg-[#080b14]/90 backdrop-blur-xl border-b border-white/8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Logo — scrolls to absolute top */}
        <button onClick={() => { setMenuOpen(false); onHome(); window.scrollTo({top:0,behavior:"smooth"}); }}
          className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-base shrink-0">🎓</div>
          <span>ProgressAI</span>
        </button>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-5">
          <button onClick={()=>handleNavClick("how-it-works")} className="text-sm font-medium text-slate-400 hover:text-white transition-colors">How it Works</button>
          <button onClick={()=>handleNavClick("stats")}         className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Stats</button>
          <button onClick={()=>handleNavClick("reviews")}       className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Reviews</button>
          <button onClick={()=>handleNavClick("faq")}           className="text-sm font-medium text-slate-400 hover:text-white transition-colors">FAQ</button>
          <button onClick={()=>{setMenuOpen(false);onNavigate("rateus");}}
            className="text-sm font-medium text-yellow-400 hover:text-yellow-300 transition-colors flex items-center gap-1">
            ★ Rate Us
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={()=>{setMenuOpen(false);onStartQuiz();}}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 text-sm font-bold hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/30 transition-all whitespace-nowrap">
            Check My Progress →
          </button>
          <button onClick={()=>setMenuOpen(o=>!o)} className="md:hidden w-9 h-9 flex flex-col justify-center items-center gap-1.5">
            <span className={`block w-5 h-0.5 bg-slate-400 transition-all origin-center ${menuOpen?"rotate-45 translate-y-2":""}`} />
            <span className={`block w-5 h-0.5 bg-slate-400 transition-all ${menuOpen?"opacity-0":""}`} />
            <span className={`block w-5 h-0.5 bg-slate-400 transition-all origin-center ${menuOpen?"-rotate-45 -translate-y-2":""}`} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-[#0d1220] border-t border-white/8 px-5 py-4 flex flex-col gap-3">
          {[["how-it-works","How it Works"],["stats","Stats"],["reviews","Reviews"],["faq","FAQ"]].map(([id,label])=>(
            <button key={id} onClick={()=>handleNavClick(id)} className="text-sm font-medium text-slate-300 hover:text-white text-left py-1 transition-colors">{label}</button>
          ))}
          <button onClick={()=>{setMenuOpen(false);onNavigate("rateus");}} className="text-sm font-medium text-yellow-400 hover:text-yellow-300 text-left py-1 transition-colors flex items-center gap-1.5">
            ★ Rate Us
          </button>
        </div>
      )}
    </nav>
  );
}

/* ─── FOOTER ────────────────────────────────── */
function Footer({ onNavigate, onStartQuiz, onScrollTo }) {
  return (
    <footer className="relative z-10 border-t border-white/8 bg-[#06080f]/90 pt-12 pb-8 mt-4">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 font-bold text-lg mb-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0">🎓</div>
              ProgressAI
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">AI-powered academic performance prediction. Know your standing, take action, graduate with confidence.</p>
            <p className="text-xs text-violet-400 mt-3 font-medium">🔬 Data collected to improve model accuracy</p>
          </div>
          <div>
            <h4 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Product</h4>
            <button onClick={onStartQuiz}               className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">Start Prediction</button>
            <button onClick={()=>onScrollTo("how-it-works")} className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">How It Works</button>
            <button onClick={()=>onScrollTo("stats")}   className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">Accuracy Stats</button>
            <button onClick={()=>onScrollTo("faq")}     className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">FAQ</button>
            <button onClick={()=>onNavigate("rateus")}  className="block text-sm text-yellow-500 hover:text-yellow-400 mb-2 transition-colors text-left w-full">★ Rate Us</button>
          </div>
          <div>
            <h4 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Resources</h4>
            <button onClick={()=>onNavigate("studytips")}   className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">Study Tips</button>
            <button onClick={()=>onNavigate("attendance")}  className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">Attendance Guide</button>
            <button onClick={()=>onNavigate("scholarship")} className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">Scholarship Info</button>
            <button onClick={()=>onNavigate("counseling")}  className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">Counseling Help</button>
          </div>
          <div>
            <h4 className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Company</h4>
            <button onClick={()=>onNavigate("about")}   className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">About Us</button>
            <button onClick={()=>onNavigate("privacy")} className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">Privacy Policy</button>
            <button onClick={()=>onNavigate("terms")}   className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">Terms of Use</button>
            <button onClick={()=>onNavigate("contact")} className="block text-sm text-slate-500 hover:text-slate-300 mb-2 transition-colors text-left w-full">Contact</button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-white/8">
          <span className="text-xs text-slate-500">© 2025 ProgressAI · Built by <a href="https://www.linkedin.com/in/mohammadumarfarook" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors">Mohammad Umar</a> (B.Tech CSE)</span>
          <div className="flex flex-wrap justify-center gap-2">
            {["🔬 Data Collected","⚡ Free Forever","🤖 AI Powered"].map(b=>(
              <span key={b} className="text-xs px-3 py-1 rounded-lg bg-white/5 border border-white/8 text-slate-400">{b}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ─── CHOICE GRID ───────────────────────────── */
function ChoiceGrid({ options, cols, value, onSelect }) {
  const gridCols = {2:"grid-cols-2",3:"grid-cols-3",4:"grid-cols-2 sm:grid-cols-4"}[cols]||"grid-cols-2";
  return (
    <div className={`grid ${gridCols} gap-2`}>
      {options.map(o=>(
        <button key={o.value} onClick={()=>onSelect(o.value)}
          className={`flex items-center gap-2 p-3 rounded-xl border text-left text-sm font-medium transition-all duration-150
            ${cols===4?"flex-col items-center text-center text-xs gap-1 py-3":""}
            ${value===o.value?"border-blue-500 bg-blue-500/10 text-white":"border-white/8 bg-white/4 text-slate-300 hover:border-white/20 hover:bg-white/8"}`}>
          <span className={cols===4?"text-xl":"text-lg leading-none"}>{o.emoji}</span>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function MultiGrid({ options, values=[], onToggle }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(o=>{
        const sel=values.includes(o.value);
        return (
          <button key={o.value} onClick={()=>onToggle(o.value)}
            className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all duration-150
              ${sel?"border-violet-500 bg-violet-500/10 text-white":"border-white/8 bg-white/4 text-slate-300 hover:border-violet-400/40"}`}>
            <span className="text-base leading-none">{o.emoji}</span>
            <span className="flex-1 text-left">{o.label}</span>
            <span className={`w-4 h-4 rounded shrink-0 border flex items-center justify-center text-[10px] transition-all ${sel?"bg-violet-500 border-violet-500 text-white":"border-white/20"}`}>
              {sel?"✓":""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── RESULT CARD ───────────────────────────── */
function ResultCard({ result, onRetry, onHome }) {
  const configs = {
    Graduate:{grad:"from-emerald-950 to-emerald-900",accent:"text-emerald-400",bar:"#34d399",tip:"You're on a strong track! Keep your attendance up, stay consistent with assignments, and avoid letting financial stress slide. You've built a solid foundation — stay consistent till the end. 🎓"},
    Dropout: {grad:"from-red-950 to-red-900",        accent:"text-red-400",    bar:"#f87171",tip:"Don't panic — this is a signal, not a verdict. Speak to your academic counselor, explore scholarships, and make attendance a priority. Change is absolutely possible right now. 💪"},
    Enrolled:{grad:"from-blue-950 to-blue-900",      accent:"text-blue-400",   bar:"#60a5fa",tip:"You're progressing steadily but there's room to improve. Focus on clearing fee backlogs, boosting attendance, and doubling down on weak subjects. Small improvements now significantly boost your graduation chances. 📚"},
  };
  const barColors={Graduate:"#34d399",Enrolled:"#60a5fa",Dropout:"#f87171"};
  const c=configs[result.prediction]||configs["Enrolled"];
  return (
    <div className="rounded-3xl overflow-hidden border border-white/10 shadow-2xl animate-popIn">
      <div className={`bg-gradient-to-br ${c.grad} p-10 text-center relative overflow-hidden`}>
        <div className="absolute inset-0 opacity-20" style={{background:`radial-gradient(circle at 50% 60%,${c.bar},transparent 65%)`}} />
        <span className="text-6xl block mb-4 relative z-10">{result.emoji}</span>
        <p className={`text-xs font-bold tracking-widest uppercase ${c.accent} mb-2 relative z-10`}>Your Academic Prediction</p>
        <h2 className={`font-display text-4xl sm:text-5xl font-extrabold ${c.accent} relative z-10`}>{result.prediction}</h2>
        <p className="text-white/70 text-sm mt-2 relative z-10">AI Confidence: <strong className="text-white">{result.confidence}%</strong></p>
      </div>
      <div className="bg-[#0d1220] p-6 sm:p-8">
        <p className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-4">Probability Breakdown</p>
        {Object.entries(result.confidence_scores||{}).map(([label,pct])=>(
          <div key={label} className="flex items-center gap-3 mb-3.5">
            <span className="text-sm font-semibold w-16 shrink-0">{label}</span>
            <div className="flex-1 h-2 bg-white/6 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000" style={{width:`${pct}%`,background:barColors[label]||"#8892a4"}} />
            </div>
            <span className="text-xs font-bold text-slate-400 w-9 text-right">{pct}%</span>
          </div>
        ))}
        <div className="bg-white/4 border border-white/8 rounded-2xl p-5 mt-5">
          <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-2">What this means for you</p>
          <p className="text-sm text-slate-300 leading-relaxed">{c.tip}</p>
        </div>
        <div className="flex items-start gap-2 mt-4 bg-violet-500/8 border border-violet-500/20 rounded-xl px-4 py-3">
          <span className="text-base shrink-0">🔬</span>
          <p className="text-xs text-violet-300 leading-relaxed">Your responses have been anonymously saved to help improve ProgressAI's model accuracy for future students.</p>
        </div>
        <div className="flex items-center gap-2 mt-4 text-xs text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0" />
          Model trained on 4,424 students · Accuracy: {result.model_accuracy} · Random Forest
        </div>
        <div className="flex gap-2.5 mt-5">
          <button onClick={onRetry} className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/8 hover:border-white/20 transition-all">🔄 Try Again</button>
          <button onClick={onHome}  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/8 hover:border-white/20 transition-all">🏠 Home</button>
          <button onClick={()=>navigator.share?.({title:"ProgressAI Result",text:`My prediction: ${result.prediction} (${result.confidence}% confidence) — progressai.app`}).catch(()=>{})}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 text-sm font-bold hover:-translate-y-0.5 transition-all">📤 Share</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════ */
export default function App() {
  const [page, setPage]       = useState("home");
  const [answers, setAnswers] = useState({});
  const [qIndex, setQIndex]   = useState(0);
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [page]);

  const allQs   = buildQuestions(answers);
  const current = allQs[qIndex];
  const isLast  = qIndex === allQs.length - 1;
  const ans     = answers[current?.id];
  const canNext = current?.optional ? true
    : current?.type === "multi" ? ((answers[current?.id]?.length||0)>0) : !!ans;

  function select(val) { setAnswers(p=>({...p,[current.id]:val})); }
  function toggleMulti(val) {
    setAnswers(p=>{ const c=p[current.id]||[]; return {...p,[current.id]:c.includes(val)?c.filter(v=>v!==val):[...c,val]}; });
  }
  function next() {
    if (!canNext) return;
    if (isLast) { submit(); return; }
    setQIndex(i=>i+1);
  }
  function back() { if (qIndex>0) setQIndex(i=>i-1); }

  async function submit() {
    setLoading(true); setError(null); setPage("quiz");
    try {
      const payload = buildPayload(answers);
      const res = await fetch(`${API_URL}/predict`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      if (!res.ok) throw new Error("Backend not reachable. Is FastAPI running on port 8000?");
      const data = await res.json();
      setResult(data);
      await saveResponseData(answers, data);
      setPage("result");
    } catch(e) { setError(e.message); setLoading(false); }
  }

  function startQuiz() { setPage("quiz"); setQIndex(0); setAnswers({}); setResult(null); setError(null); }
  function goHome()    { setPage("home"); }
  function handleScrollTo(id) {
    if (page !== "home") { setPage("home"); setTimeout(()=>smoothScrollTo(id),150); }
    else smoothScrollTo(id);
  }

  const STATIC_PAGES = ["about","privacy","terms","contact","studytips","attendance","scholarship","counseling","rateus"];

  return (
    <div className="min-h-screen bg-[#060810] text-slate-100" style={{fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Syne:wght@700;800&display=swap');
        .font-display{font-family:'Syne',sans-serif;}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes popIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .animate-blink{animation:blink 2s infinite;}
        .animate-fadeUp{animation:fadeUp .4s ease both;}
        .animate-popIn{animation:popIn .45s cubic-bezier(.175,.885,.32,1.275) both;}
        .spinner{animation:spin .75s linear infinite;}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:99px}
      `}</style>

      {/* BG */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{background:"radial-gradient(ellipse 60% 40% at 15% 0%,rgba(79,142,247,.09),transparent 60%),radial-gradient(ellipse 50% 35% at 85% 100%,rgba(139,92,246,.07),transparent 55%)"}} />

      {/* Navbar — always visible */}
      <Navbar page={page} onHome={goHome} onStartQuiz={startQuiz} onNavigate={setPage} />

      {/* Static pages */}
      {STATIC_PAGES.includes(page) && (
        <div className="relative z-10">
          {page==="about"      && <AboutPage      onBack={goHome}/>}
          {page==="privacy"    && <PrivacyPage    onBack={goHome}/>}
          {page==="terms"      && <TermsPage      onBack={goHome}/>}
          {page==="contact"    && <ContactPage    onBack={goHome}/>}
          {page==="studytips"  && <StudyTipsPage  onBack={goHome}/>}
          {page==="attendance" && <AttendancePage onBack={goHome}/>}
          {page==="scholarship"&& <ScholarshipPage onBack={goHome}/>}
          {page==="counseling" && <CounselingPage onBack={goHome}/>}
          {page==="rateus"     && <RateUsPage     onBack={goHome}/>}
          <Footer onNavigate={setPage} onStartQuiz={startQuiz} onScrollTo={handleScrollTo}/>
        </div>
      )}

      {/* Home */}
      {page==="home" && (
        <div className="relative z-10">
          {/* Hero */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fadeUp">
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/25 rounded-full px-4 py-1.5 mb-6">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-blink shrink-0"/>
                <span className="text-xs font-bold text-blue-400 tracking-widest uppercase">AI-Powered · Free · Instant</span>
              </div>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight mb-5">
                Are You Really<br/>
                <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">On Track?</span>
              </h1>
              <p className="text-slate-400 text-base sm:text-lg leading-relaxed mb-8 max-w-lg">
                Stop guessing about your academic future. Answer honest questions — our AI tells you if you're thriving, at risk, or need to change something <em className="text-white not-italic font-semibold">right now.</em>
              </p>
              <div className="flex flex-wrap gap-3 mb-10">
                <button onClick={startQuiz} className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-600 font-bold text-base hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/40 transition-all">
                  🔮 Predict My Performance
                </button>
                <button onClick={()=>smoothScrollTo("how-it-works")} className="px-6 py-3.5 rounded-2xl border border-white/15 font-bold text-base text-slate-300 hover:border-white/30 hover:text-white transition-all">
                  See How It Works
                </button>
              </div>
              <div className="flex gap-8">
                {[["4,400+","Students analyzed"],["77.6%","Model accuracy"],["2 min","Time to result"]].map(([n,l])=>(
                  <div key={l}>
                    <div className="text-2xl font-extrabold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">{n}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative hidden lg:block">
              <div className="absolute -top-4 right-6 bg-[#0d1220] border border-white/15 rounded-xl px-4 py-2 text-sm font-semibold text-emerald-400 shadow-xl z-10">🎓 Graduate · 84% confidence</div>
              <div className="bg-[#0d1220] border border-white/12 rounded-3xl p-7 shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <span className="font-bold text-sm">Student Performance Report</span>
                  <span className="text-xs font-bold bg-emerald-500/15 text-emerald-400 px-2.5 py-1 rounded-lg">● Live</span>
                </div>
                {[["Graduate","#34d399",84],["Enrolled","#60a5fa",12],["Dropout","#f87171",4]].map(([l,c,p])=>(
                  <div key={l} className="flex items-center gap-3 mb-3">
                    <span className="text-xs text-slate-400 w-16 shrink-0">{l}</span>
                    <div className="flex-1 h-1.5 bg-white/6 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{width:`${p}%`,background:c}}/>
                    </div>
                    <span className="text-xs font-bold text-slate-400 w-8 text-right">{p}%</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-4 mt-2 border-t border-white/8 text-xs">
                  <span className="text-emerald-400 font-bold">🎓 Predicted: Graduate</span>
                  <span className="text-slate-500">Random Forest · 77.6% acc</span>
                </div>
              </div>
              <div className="absolute -bottom-4 left-6 bg-[#0d1220] border border-white/15 rounded-xl px-4 py-2 text-sm font-semibold text-blue-400 shadow-xl">⚡ Powered by Machine Learning</div>
            </div>
          </section>

          {/* How it works */}
          <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-white/6">
            <SectionTag color="violet">How It Works</SectionTag>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 mb-3 tracking-tight">Simple. Smart. Honest.</h2>
            <p className="text-slate-400 text-base max-w-lg mb-10">No complex forms. Just real questions any student can answer in 2 minutes.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[["1","Share Your Story","Tell us about your scores, attendance, living situation, and background."],["2","AI Analyses","Random Forest model trained on 4,400+ students processes your inputs."],["3","Get Prediction","See if you're on track to Graduate, safely Enrolled, or at risk."],["4","Take Action","Get personalised tips on what to improve right now."]].map(([n,t,d])=>(
                <div key={n} className="bg-[#0d1220] border border-white/8 rounded-2xl p-6 hover:border-white/15 hover:-translate-y-1 transition-all">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center font-extrabold text-sm mb-4">{n}</div>
                  <h3 className="font-bold text-sm mb-2">{t}</h3><p className="text-xs text-slate-400 leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Stats */}
          <section id="stats" className="bg-gradient-to-r from-blue-500/6 to-violet-500/6 border-y border-white/6 py-12">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
              {[["4,424","Students in training data"],["77.6%","Prediction accuracy"],["36","Factors analysed"],["3","Outcome categories"]].map(([n,l])=>(
                <div key={l}>
                  <div className="font-display text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">{n}</div>
                  <div className="text-xs text-slate-400 mt-1.5">{l}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Testimonials */}
          <section id="reviews" className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
            <SectionTag color="blue">Student Reviews</SectionTag>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 mb-3 tracking-tight">What Students Say</h2>
            <p className="text-slate-400 text-base max-w-lg mb-10">Real feedback from students who used ProgressAI to understand where they stand.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {s:"★★★★★",t:"It predicted I was at dropout risk — and it was right. Attendance below 50%, fees pending. Wake-up call I needed.",n:"Rohan M.",r:"B.Tech 3rd Year, Delhi",e:"👦",c:"from-blue-900/40"},
                {s:"★★★★★",t:"Took 2 minutes and told me I'm on track to graduate. Loved the probability breakdown — very clean and easy.",n:"Priya S.",r:"BBA 2nd Semester, Mumbai",e:"👧",c:"from-violet-900/40"},
                {s:"★★★★☆",t:"Questions felt very real — asked about 10th and 12th separately, scholarship, where I live. Very thoughtful.",n:"Aman K.",r:"BSc 4th Semester, Bangalore",e:"👦",c:"from-emerald-900/30"},
                {s:"★★★★★",t:"On an education loan, living away from home, average sem 1. It correctly flagged me as moderate risk.",n:"Sneha T.",r:"MBA 1st Year, Pune",e:"👧",c:"from-blue-900/40"},
                {s:"★★★★★",t:"My counselor said the factors it uses are exactly what affects real dropout rates. Impressive for a free tool!",n:"Vikram P.",r:"B.Com 5th Semester, Hyderabad",e:"👦",c:"from-violet-900/40"},
                {s:"★★★★☆",t:"Transparent about using data to improve the AI. That honesty builds trust. Good experience overall.",n:"Meera R.",r:"BCA 3rd Year, Chennai",e:"👧",c:"from-emerald-900/30"},
              ].map((t,i)=>(
                <div key={i} className={`bg-gradient-to-b ${t.c} to-transparent bg-[#0d1220] border border-white/8 rounded-2xl p-6`}>
                  <div className="text-yellow-400 text-sm mb-3">{t.s}</div>
                  <p className="text-sm text-slate-300 leading-relaxed mb-4">"{t.t}"</p>
                  <div className="flex items-center gap-3 pt-4 border-t border-white/6">
                    <div className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-base shrink-0">{t.e}</div>
                    <div><div className="text-sm font-bold">{t.n}</div><div className="text-xs text-slate-500">{t.r}</div></div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
            <div className="bg-gradient-to-br from-blue-500/10 to-violet-500/10 border border-blue-500/20 rounded-3xl p-10 sm:p-14 text-center">
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">Ready to Know Where You Stand?</h2>
              <p className="text-slate-400 text-base max-w-md mx-auto mb-8">Free, under 2 minutes, and might just change how you approach your studies.</p>
              <button onClick={startQuiz} className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-600 font-bold text-lg hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-500/40 transition-all">
                🔮 Start My Prediction
              </button>
            </div>
          </section>

          {/* FAQ */}
          <section id="faq" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 border-t border-white/6">
            <SectionTag color="emerald">FAQ</SectionTag>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold mt-4 mb-10 tracking-tight">Common Questions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                ["Is this tool really free?","Yes, 100% free. No sign-up, no email required. Just answer and get your result instantly."],
                ["Do you collect my data?","Yes — your anonymised responses are saved to retrain and improve ProgressAI's accuracy. No personal identity is stored."],
                ["How accurate is the AI?","Our model achieves 77.6% accuracy on real student data from 4,400+ students. It improves as more students use it."],
                ["What if I'm in 1st semester?","No problem! We use your 10th and 12th scores as the baseline for sem 1 students."],
                ["Can I retake the quiz?","Absolutely. Try different scenarios — like what happens if you improve attendance or clear dues."],
                ["Which students is this for?","Any UG or PG student — engineering, medicine, arts, commerce, law — all fields apply."],
              ].map(([q,a],i)=>(
                <div key={i} className="bg-[#0d1220] border border-white/8 rounded-2xl p-5 hover:border-white/15 transition-all">
                  <div className="font-bold text-sm mb-2">{q}</div>
                  <div className="text-xs text-slate-400 leading-relaxed">{a}</div>
                </div>
              ))}
            </div>
          </section>

          <Footer onNavigate={setPage} onStartQuiz={startQuiz} onScrollTo={handleScrollTo}/>
        </div>
      )}

      {/* Quiz / Result */}
      {(page==="quiz"||page==="result") && (
        <div className="relative z-10 max-w-xl mx-auto px-4 sm:px-6 py-8 pb-24 min-h-screen">
          <button onClick={goHome} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-6">← Back to Home</button>

          {loading && (
            <div className="bg-[#0d1220] border border-white/8 rounded-3xl p-12 text-center animate-fadeUp">
              <div className="w-12 h-12 border-2 border-blue-500/20 border-t-blue-400 rounded-full spinner mx-auto mb-5"/>
              <p className="font-bold text-lg mb-2">Analysing your academic profile…</p>
              <p className="text-slate-400 text-sm">Our AI is crunching the numbers ✨</p>
            </div>
          )}

          {page==="result" && result && !loading && <ResultCard result={result} onRetry={startQuiz} onHome={goHome}/>}

          {page==="quiz" && !loading && current && (
            <>
              <div className="mb-5">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400 font-medium">{current.section}</span>
                  <span className="text-blue-400 font-bold">{qIndex+1} / {allQs.length}</span>
                </div>
                <div className="h-1 bg-white/6 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-500"
                    style={{width:`${Math.round((qIndex/allQs.length)*100)}%`}}/>
                </div>
              </div>

              <div className="bg-[#0d1220] border border-white/8 rounded-3xl p-6 sm:p-8 animate-fadeUp">
                <div className="text-xs font-bold tracking-widest uppercase text-blue-400 mb-2">{current.icon} {current.section}</div>
                <p className="text-lg sm:text-xl font-bold leading-snug mb-1.5">{current.q}</p>
                {current.hint && <p className="text-sm text-slate-400 mb-5 leading-relaxed">{current.hint}</p>}
                {!current.hint && <div className="mb-5"/>}

                {current.type==="choice" && <ChoiceGrid options={current.options} cols={current.cols} value={ans} onSelect={select}/>}
                {current.type==="multi"  && <MultiGrid  options={current.options} values={answers[current.id]||[]} onToggle={toggleMulti}/>}
                {current.type==="number" && (
                  <div className="flex items-center gap-3">
                    <button onClick={()=>select(Math.max(current.min,(parseInt(ans)||20)-1))} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-xl hover:border-blue-400/50 hover:text-blue-400 transition-all shrink-0">−</button>
                    <input type="number" value={ans||""} placeholder={current.placeholder} min={current.min} max={current.max} onChange={e=>select(e.target.value)}
                      className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-center text-2xl font-bold outline-none focus:border-blue-500 transition-colors"/>
                    <button onClick={()=>select(Math.min(current.max,(parseInt(ans)||19)+1))} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-xl hover:border-blue-400/50 hover:text-blue-400 transition-all shrink-0">+</button>
                  </div>
                )}

                {error && <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 text-sm text-red-300">⚠️ {error}</div>}

                <div className="flex gap-3 mt-6">
                  {qIndex>0 && <button onClick={back} className="px-5 py-3 rounded-xl border border-white/10 text-slate-400 text-sm font-bold hover:border-white/20 hover:text-white transition-all">← Back</button>}
                  <button onClick={next} disabled={!canNext}
                    className={`flex-1 py-3.5 rounded-xl text-sm font-bold transition-all
                      ${isLast?"bg-gradient-to-r from-emerald-500 to-violet-600":"bg-gradient-to-r from-blue-500 to-violet-600"}
                      ${canNext?"hover:-translate-y-0.5 hover:shadow-lg":"opacity-35 cursor-not-allowed"}`}>
                    {isLast?"🔮 Predict My Performance":"Continue →"}
                  </button>
                </div>
                {current.optional && (
                  <div className="text-center mt-3">
                    <button onClick={()=>setQIndex(i=>i+1)} className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors">Skip this →</button>
                  </div>
                )}
              </div>
              <p className="text-center text-xs text-slate-600 mt-4">🔬 Your responses are anonymously collected to improve our AI model</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
