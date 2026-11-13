/* office-drum.js · Office Noun × Drum. One file, no dependencies.
   Load this file with a script tag, then place an office-drum element with theme office, pointcast or elsegundo.
   Taps go to the PointCast drum (one shared counter). Noun from the official CC0 traits. */
(function(){
if(customElements.get("office-drum"))return;
var NOUN={"pal":["#cfc2ab","#f8ddb0","#5648ed","#00a556","#ffffff","#000000","#d22209","#0b5027","#5a423f","#42ffb0","#d56333","#cbc1bc","#e5e5de","#ab36be"],"rows":["........aaaaaaaaaaaaaaaaaa......","........aaaaaaaaaaaaaaaaaa......","........abbbbabbbaccccccca......","........aaaaaabbbaccccccca......","........abbbbaaaaaaaaaaaaa......","........aaaaaabbbabbbabbba......","........abddddddaddddddaaa......","........aadeeffdbdeeffdbba......",".......ddddeeffdddeeffdaaa......",".......dagdeeffdbdeeffdbba......",".......daadeeffdadeeffdaaa......","........ahddddddhddddddhha......","......iiahjhhhjhhhjhjhjjha......","......iiahjjjhjjhhjhjhjjha......","......iiahjhjhjjjhjhjhjjha......","......iiahhhhhhhhhhhhhhhha......","........akkkkkkkkkkkkkkkka......","........aaaaaaaaaaaaaaaaaa......",".........lllllmnnmlllll.........",".........lllllmnnmlllll.........",".........ll.llmnnmlllll.........",".........ll.llmnnmlllll.........",".........ll.llmnnmlllll.........",".........ll.llmnnmlllll.........",".........ll.llmnnmlllll.........",".........ll.llmnnmlllll.........",".........ll.llmnnmlllll........."]};
var DRUM=["....HHHHHHHHHHHH....","..HHhhhhhhhhhhhhHH..",".HhhhhhhhhhhhhhhhhH.",".RHHhhhhhhhhhhhhHHR.",".RRRHHHHHHHHHHHHRRR.",".RYRRRRRRRRRRRRRRYR.",".RRYRRRYRRRRYRRRYRR.",".RRRYRYRYRRYRYRYRRR.",".RRRRYRRRYYRRRYRRRR.",".RRRRRRRRRRRRRRRRRR.",".KKKKKKKKKKKKKKKKKK.","..RRRRRRRRRRRRRRRR..","..K..............K..","..K..............K.."];
var THEMES={
 office:{bg:"#264aa0",floor:"#1c3678",ink:"#17131c",paper:"#efe3c4",accent:"#ffb23e",drum:"#c43e30",line:"the only meeting that is one tap long.",label:"ANOTHER DAY AT THE OFFICE"},
 pointcast:{bg:"#17131c",floor:"#241c30",ink:"#0e0c12",paper:"#efe3c4",accent:"#ffb23e",drum:"#c43e30",line:"one tap. everybody hears it.",label:"POINTCAST · OFFICE DRUM"},
 elsegundo:{bg:"#2b7a8c",floor:"#d9b77a",ink:"#12303a",paper:"#f4ecd6",accent:"#ff8a3c",drum:"#d2553a",line:"one drum for the whole town.",label:"EL SEGUNDO · OFFICE DRUM"}};
var CSS=":host{display:block;max-width:420px;margin:0 auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--paper)}"+
".card{background:var(--ink);color:var(--paper);border:8px solid var(--paper);padding:0;overflow:hidden}"+
".top{display:flex;justify-content:space-between;gap:8px;padding:10px 12px;font-size:11px;font-weight:700;letter-spacing:.06em;background:var(--bg)}"+
".top span:last-child{color:var(--accent)}"+
"button.pad{display:block;width:100%;border:0;padding:0;margin:0;background:var(--bg);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}"+
"button.pad:focus-visible{outline:3px solid var(--accent);outline-offset:-3px}"+
"canvas{display:block;width:100%;height:auto;image-rendering:pixelated}"+
".rule{height:6px;background:var(--accent)}"+
".foot{padding:14px 12px 16px;text-align:center}"+
".n{font-size:34px;font-weight:700;letter-spacing:.04em;font-variant-numeric:tabular-nums}"+
".u{font-size:11px;letter-spacing:.12em;opacity:.7;margin-top:2px}"+
".l{font-size:13px;color:var(--accent);margin-top:10px}"+
".s{font-size:11px;opacity:.6;margin-top:8px;min-height:1.3em}"+
"@media (prefers-reduced-motion:reduce){canvas{transition:none}}";
function sid(){try{var k="office-drum:sid",v=localStorage.getItem(k);if(!v){v="od-"+Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem(k,v)}return v}catch(e){return "od-"+Math.random().toString(36).slice(2)}}
class OfficeDrum extends HTMLElement{
 connectedCallback(){
  if(this._on)return;this._on=true;
  var t=THEMES[this.getAttribute("theme")]||THEMES.office;this.t=t;
  this.api=this.getAttribute("api")||"https://pointcast.xyz/api/drum";
  this.app=this.getAttribute("app")||"office-noun";
  this.sid=sid();this.pending=0;this.mine=0;this.total=null;this.hit=0;this.rings=[];this.live=true;
  var r=this.attachShadow({mode:"open"});
  r.innerHTML="<style>"+CSS+"</style><div class='card' style='--bg:"+t.bg+";--ink:"+t.ink+";--paper:"+t.paper+";--accent:"+t.accent+"'>"+
   "<div class='top'><span>"+t.label+"</span><span>DRUM</span></div>"+
   "<button class='pad' type='button' aria-label='Tap the drum once'><canvas width='320' height='300'></canvas></button>"+
   "<div class='rule'></div><div class='foot'><div class='n' aria-live='polite'>…</div><div class='u'>HITS, ALL TIME, EVERYONE</div>"+
   "<div class='l'>"+t.line+"</div><div class='s'></div></div></div>";
  this.cv=r.querySelector("canvas");this.cx=this.cv.getContext("2d");this.nEl=r.querySelector(".n");this.sEl=r.querySelector(".s");
  var self=this;r.querySelector("button").addEventListener("click",function(){self.tap()});
  this.draw();this.read();
  this._poll=setInterval(function(){if(document.visibilityState==="visible")self.read()},8000);
  this._vis=function(){if(document.visibilityState==="hidden")self.flush()};document.addEventListener("visibilitychange",this._vis);
 }
 disconnectedCallback(){clearInterval(this._poll);document.removeEventListener("visibilitychange",this._vis);this.flush();this._on=false}
 show(){this.nEl.textContent=this.total==null?(this.mine?String(this.mine):"…"):Number(this.total+this.pending).toLocaleString();
  this.sEl.textContent=(this.live?"":"preview · not connected to the drum · ")+(this.mine?"you: "+this.mine+(this.mine===1?" tap":" taps"):"tap the drum")}
 read(){var self=this;fetch(this.api+"?sessionId="+encodeURIComponent(this.sid)).then(function(x){if(!x.ok)throw 0;return x.json()}).then(function(j){if(typeof j.globalTotal==="number"){self.total=j.globalTotal;self.live=true;self.show()}}).catch(function(){self.live=false;self.show()})}
 flush(){if(this.pending<=0)return;var d=this.pending,self=this;this.pending=0;clearTimeout(this._ft);
  fetch(this.api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({delta:d,sessionId:this.sid,app:this.app,kind:"embed"}),keepalive:true})
   .then(function(x){if(!x.ok)throw 0;return x.json()}).then(function(j){if(typeof j.globalTotal==="number"){self.total=j.globalTotal;self.live=true}self.show()})
   .catch(function(){self.live=false;if(self.total!=null)self.total+=d;self.show()})}
 tap(){this.mine++;this.pending++;this.hit=1;this.rings.push(0);this.sound();this.show();
  var self=this;clearTimeout(this._ft);if(this.pending>=10)this.flush();else this._ft=setTimeout(function(){self.flush()},1200);
  if(!this._raf)this.loop()}
 sound(){try{var A=window.AudioContext||window.webkitAudioContext;if(!A)return;var a=this.ac||(this.ac=new A());if(a.state==="suspended")a.resume();
  var n=a.currentTime,o=a.createOscillator(),g=a.createGain();o.type="sine";o.frequency.setValueAtTime(170,n);o.frequency.exponentialRampToValueAtTime(52,n+.22);
  g.gain.setValueAtTime(.9,n);g.gain.exponentialRampToValueAtTime(.001,n+.36);o.connect(g);g.connect(a.destination);o.start(n);o.stop(n+.4);
  var b=a.createBuffer(1,2205,a.sampleRate),d=b.getChannelData(0);for(var i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);
  var s=a.createBufferSource(),g2=a.createGain();s.buffer=b;g2.gain.value=.25;s.connect(g2);g2.connect(a.destination);s.start(n)}catch(e){}}
 loop(){var self=this,still=matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  this.hit=still?0:Math.max(0,this.hit-.09);this.rings=still?[]:this.rings.map(function(v){return v+.05}).filter(function(v){return v<1});
  this.draw();this._raf=(this.hit>0||this.rings.length)?requestAnimationFrame(function(){self.loop()}):0}
 draw(){var c=this.cx,t=this.t,W=320,H=300,p=8;c.imageSmoothingEnabled=false;
  c.fillStyle=t.bg;c.fillRect(0,0,W,H);c.fillStyle=t.floor;c.fillRect(0,236,W,64);
  for(var i=0;i<this.rings.length;i++){var v=this.rings[i];c.globalAlpha=1-v;c.strokeStyle=i%2?t.accent:t.paper;c.lineWidth=4;c.beginPath();c.ellipse(160,214,40+v*150,14+v*60,0,Math.PI,2*Math.PI);c.stroke()}c.globalAlpha=1;
  var rows=NOUN.rows,w=rows[0].length,nx=Math.round(160-w*p/2)-2,ny=196-rows.length*p+Math.round(this.hit*4);
  for(var y=0;y<rows.length;y++)for(var x=0;x<w;x++){var ch=rows[y][x];if(ch!=="."){c.fillStyle=NOUN.pal[ch.charCodeAt(0)-97];c.fillRect(nx+x*p,ny+y*p,p,p)}}
  var col={H:"#d6c8aa",h:"#f6eed8",R:t.drum,Y:t.accent,K:"#363242"},sq=Math.round(this.hit*6),dy=270-DRUM.length*p+sq;
  for(var y2=0;y2<DRUM.length;y2++)for(var x2=0;x2<20;x2++){var k=DRUM[y2][x2];if(k!=="."){c.fillStyle=col[k];c.fillRect(80+x2*p,dy+y2*p-(y2>11?sq:0),p,p)}}
  for(var s=0;s<H;s+=4){c.fillStyle="rgba(0,0,0,.08)";c.fillRect(0,s+2,W,2)}}
}
customElements.define("office-drum",OfficeDrum);
})();
