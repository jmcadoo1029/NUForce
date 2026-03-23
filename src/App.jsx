import { useState, useMemo, useEffect, useRef } from "react";

// ── Pricing constants ─────────────────────────────────────────────────────────
const NOISE_BASE_30={"<=140dB":3950,"145dB":4500,"150dB":5250,"155dB":5950,"160dB":7450,"165dB":8500,"170dB":12500};
const NOISE_BASE_60={"<=140dB":4925,"145dB":5750,"150dB":6875,"155dB":7925,"160dB":9175,"165dB":10750,"170dB":15750};
const NOISE_FAC={"Speakerbox":1000,"64 Reverb Chamber":1500,"300 Reverb Chamber":2000,"Prog Wave Tube":2750};
const ENV_TH_PRICES={"0 to 1 Day":1000,"3 Days":1350,"5 Days":1875,"7 Days":2275,"10 Days":2950};
const PROC_BASE=1600, REPORT_BASE=950;
const EMI_SR=1600, PQ_SR=1450, DCM_SR=1600;
const PQ_ROWS=[
  {key:"5.3.1",label:"Voltage Variation",sh:1},
  {key:"5.3.2",label:"Voltage Modulation",sh:1},
  {key:"5.3.3",label:"Voltage Spike (300B)",sh:2},
  {key:"5.3.4",label:"Voltage Dropout",sh:1},
  {key:"5.3.5",label:"Voltage Spike (P1)",sh:2},
  {key:"5.3.6",label:"Frequency Variation",sh:1},
  {key:"5.3.7",label:"Current Waveform",sh:1},
  {key:"5.3.8",label:"DC Offset",sh:1},
  {key:"5.3.9",label:"Fault Clearing",sh:1},
];

const money = n => "$"+Math.round(n).toLocaleString();
const r25 = n => Math.round(n/25)*25;
const sf = (v,d=0) => { const n=parseFloat(v); return isNaN(n)?d:n; };
const mwDisc=vs=>{if(vs<=4000)return 1000;if(vs<=5000)return 1250;if(vs<=7000)return 1500;if(vs<=9000)return 1750;return 2000;};
const lwDisc=vs=>{if(vs<=2000)return 500;if(vs<=3000)return 750;return 1000;};
// MW testing price based on unit weight (lbs)
const mwTesting=wt=>{if(!wt||wt<=0)return 4575;if(wt<=2500)return 4575;if(wt<=3500)return 5575;return 6250;};

// ── Theme ─────────────────────────────────────────────────────────────────────
const C={
  bg:"#f0f2f5",panel:"#e8ecf0",card:"#ffffff",border:"#d0d7de",
  red:"#c0392b",redDim:"#e74c3c",muted:"#6b7a8d",dim:"#9aa5b1",
  text:"#1a2332",accent:"#1a5276",green:"#1e8449",warn:"#b7791f",
};
const inp={background:"#f8f9fa",border:"1px solid "+C.border,borderRadius:6,padding:"5px 8px",
  color:C.text,fontSize:12,outline:"none",fontFamily:"inherit",boxSizing:"border-box"};
const sel={...inp,cursor:"pointer"};
const card={background:C.card,border:"1px solid "+C.border,borderRadius:10,
  padding:12,marginBottom:10,boxShadow:"0 1px 3px rgba(0,0,0,0.07)"};

// ── Base components ───────────────────────────────────────────────────────────
function Toggle({checked,onChange,label,small}){
  return(
    <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",userSelect:"none"}}>
      <div onClick={()=>onChange(!checked)} style={{width:small?30:34,height:small?17:19,borderRadius:10,
        background:checked?C.red:C.dim,position:"relative",transition:"background .15s",flexShrink:0}}>
        <div style={{position:"absolute",top:2,left:checked?(small?15:17):2,
          width:small?13:15,height:small?13:15,borderRadius:"50%",background:"#fff",transition:"left .15s"}}/>
      </div>
      {label&&<span style={{fontSize:small?11:12,color:C.muted}}>{label}</span>}
    </label>
  );
}

function Inp({value,onChange,width=90,right,placeholder}){
  return <input value={value} onChange={e=>onChange(e.target.value)}
    placeholder={placeholder||""}
    style={{...inp,width,textAlign:right?"right":"left"}}/>;
}
function Sel({value,onChange,options,width=160}){
  return <select value={value} onChange={e=>onChange(e.target.value)} style={{...sel,width}}>
    {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
  </select>;
}
function Row({label,children,mb=8}){
  return <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:mb}}>
    <span style={{fontSize:11,color:C.muted,minWidth:120}}>{label}</span>{children}
  </div>;
}
function PRow({label,val,onChange}){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
      <span style={{fontSize:11,color:C.muted,flex:1}}>{label}</span>
      <div style={{display:"flex",alignItems:"center",gap:3}}>
        <span style={{fontSize:11,color:C.muted}}>$</span>
        <Inp value={val} onChange={onChange} width={80} right/>
      </div>
    </div>
  );
}
const HR=()=><div style={{height:1,background:C.border,margin:"10px 0"}}/>;

function Pia({s,set}){
  const levels=[{p:"PIA 1",m:1.10},{p:"PIA 2",m:1.15},{p:"PIA 3",m:1.20}];
  const cur=s.pia||0;
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
      <span style={{fontSize:11,color:C.muted,minWidth:30}}>PIA:</span>
      {levels.map((l,i)=>(
        <label key={i} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
          <input type="checkbox" checked={cur===l.m}
            onChange={()=>set({...s,pia:cur===l.m?0:l.m})}
            style={{accentColor:C.red,width:13,height:13}}/>
          <span style={{fontSize:11,color:cur===l.m?C.redDim:C.muted}}>{l.p}</span>
        </label>
      ))}
      {cur>0&&<span style={{fontSize:10,color:C.redDim,marginLeft:4}}>
        +{Math.round((cur-1)*100)}%
      </span>}
    </div>
  );
}

function ProcReport({s,set,procPrice,reportPrice,sectionCode}){
  const pp=procPrice||PROC_BASE;
  const rp=reportPrice||REPORT_BASE;
  return(
    <div style={{marginTop:8}}>
      <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:8}}>
        <Toggle small checked={s.proc||false} onChange={v=>set({...s,proc:v})}
          label={"Procedure $"+pp.toLocaleString()}/>
        <Toggle small checked={s.report||false} onChange={v=>set({...s,report:v})}
          label={"Report $"+rp.toLocaleString()}/>
      </div>
      <SectionCustom s={s} set={set} sectionCode={sectionCode}/>
    </div>
  );
}

function SectionCustom({s,set,sectionCode}){
  const rows=s.customRows||[];
  const add=()=>set({...s,customRows:[...rows,{label:"",price:"0",code:sectionCode||""}]});
  const rem=i=>set({...s,customRows:rows.filter((_,j)=>j!==i)});
  const upd=(i,k,v)=>set({...s,customRows:rows.map((r,j)=>j===i?{...r,[k]:v}:r)});
  return(
    <div>
      {rows.map((r,i)=>(
        <div key={i} style={{display:"flex",gap:5,alignItems:"center",marginBottom:4}}>
          <Inp value={r.label} onChange={v=>upd(i,"label",v)} width={160} placeholder="Custom line item"/>
          <span style={{fontSize:11,color:C.muted}}>$</span>
          <Inp value={r.price} onChange={v=>upd(i,"price",v)} width={70} right/>
          <button onClick={()=>rem(i)} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:13}}>✕</button>
        </div>
      ))}
      <button onClick={add} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,padding:0,marginTop:2}}>
        + Add custom line
      </button>
    </div>
  );
}

// ── Section wrapper with expand-on-enable ─────────────────────────────────────
function Section({title,enabled,onToggle,tag,children}){
  const [open,setOpen]=useState(false);
  useEffect(()=>{if(enabled)setOpen(true);},[enabled]);
  const handleToggle=v=>{onToggle(v);if(v)setOpen(true);};
  return(
    <div style={{...card,padding:0,overflow:"hidden",
      border:"1px solid "+(enabled?C.red+"66":C.border),
      boxShadow:enabled?"0 1px 4px rgba(192,57,43,0.12)":"0 1px 3px rgba(0,0,0,0.06)"}}>
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"10px 14px",
        background:enabled?"#fdf3f2":C.card,cursor:"pointer",
        borderBottom:enabled&&open?"1px solid "+C.border:"none"}}
        onClick={()=>{if(enabled)setOpen(o=>!o);}}>
        <div onClick={e=>{e.stopPropagation();handleToggle(!enabled);}}>
          <Toggle checked={enabled} onChange={handleToggle}/>
        </div>
        <span style={{fontWeight:600,fontSize:12,color:enabled?C.red:C.muted,flex:1,letterSpacing:.3}}>{title}</span>
        {tag&&<span style={{fontSize:10,background:C.red+"18",color:C.red,borderRadius:4,padding:"2px 6px",fontWeight:600}}>{tag}</span>}
        {enabled&&<span style={{color:C.dim,fontSize:11}}>{open?"▲":"▼"}</span>}
      </div>
      {enabled&&open&&<div style={{padding:"12px 14px 14px",background:"#fff"}}>{children}</div>}
      {enabled&&!open&&(
        <div style={{padding:"3px 14px 7px",cursor:"pointer",background:"#fdf3f2"}}
          onClick={()=>setOpen(true)}>
          <span style={{fontSize:10,color:C.redDim}}>click to expand ▼</span>
        </div>
      )}
    </div>
  );
}

// Identifier input that buffers locally — avoids losing focus on parent re-render
function IdentifierInput({value,onCommit,style}){
  const [local,setLocal]=React.useState(value||"");
  const lastCommit=React.useRef(value||"");
  React.useEffect(()=>{
    if(value!==lastCommit.current){
      lastCommit.current=value||"";
      setLocal(value||"");
    }
  },[value]);
  return <input value={local}
    onChange={e=>setLocal(e.target.value)}
    onBlur={e=>{lastCommit.current=e.target.value;onCommit(e.target.value);}}
    placeholder="Identifier (e.g. S/N, Unit #)"
    style={style}/>;
}

function TestInstance({inst,idx,total,Form,formProps,onUpdate,onRemove}){
  const [localId,setLocalId]=useState(inst.identifier||"");
  useEffect(()=>setLocalId(inst.identifier||""),[inst.id]);
  const commitId=()=>onUpdate(idx,prev=>({...prev,identifier:localId}));
  return(
    <div style={{
      border:idx>0?"1px solid "+C.border:"none",
      borderRadius:idx>0?8:0,padding:idx>0?10:0,marginBottom:idx>0?10:0,
      background:idx>0?C.panel:"transparent"}}>
      {idx>0&&(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <Toggle small checked={inst.on} onChange={v=>onUpdate(idx,{...inst,on:v})}
            label={"Test #"+(idx+1)}/>
          <input value={localId} onChange={e=>setLocalId(e.target.value)} onBlur={commitId}
            placeholder="Identifier (e.g. S/N, Unit #)"
            style={{...inp,flex:1,fontSize:11}}/>
          <button onClick={()=>onRemove(idx)}
            style={{background:"none",border:"none",color:C.redDim,cursor:"pointer",fontSize:12,padding:"0 6px",fontWeight:600}}>
            Remove
          </button>
        </div>
      )}
      {idx===0&&total>1&&(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{fontSize:11,color:C.muted,fontWeight:600}}>Test #1</span>
          <input value={localId} onChange={e=>setLocalId(e.target.value)} onBlur={commitId}
            placeholder="Identifier (e.g. S/N, Unit #)"
            style={{...inp,flex:1,fontSize:11}}/>
        </div>
      )}
      <Form s={inst} set={s=>onUpdate(idx,s)} {...formProps}/>
    </div>
  );
}

function MultiSection({title,instances,onAdd,onRemove,onUpdate,tag,newInstance,Form,formProps}){
  const anyOn=instances.some(i=>i.on);
  const [open,setOpen]=useState(false);
  // Auto-expand when any instance turns on
  useEffect(()=>{if(anyOn)setOpen(true);},[anyOn]);
  const handleToggle=v=>{
    if(v&&instances.length===0){onAdd();setOpen(true);}
    else{onUpdate(0,{...instances[0],on:v});if(v)setOpen(true);}
  };
  return(
    <div style={{...card,padding:0,overflow:"hidden",
      border:"1px solid "+(anyOn?C.red+"66":C.border),
      boxShadow:anyOn?"0 1px 4px rgba(192,57,43,0.12)":"0 1px 3px rgba(0,0,0,0.06)"}}>
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"10px 14px",
        background:anyOn?"#fdf3f2":C.card,cursor:"pointer",
        borderBottom:anyOn&&open?"1px solid "+C.border:"none"}}
        onClick={()=>{if(anyOn)setOpen(o=>!o);}}>
        <div onClick={e=>{e.stopPropagation();if(instances[0])onUpdate(0,{...instances[0],on:!instances[0].on});}}>
          <Toggle checked={anyOn} onChange={()=>{}}/>
        </div>
        <span style={{fontWeight:600,fontSize:12,color:anyOn?C.red:C.muted,flex:1,letterSpacing:.3}}>{title}</span>
        {instances.length>1&&<span style={{fontSize:10,background:C.accent+"22",color:C.accent,borderRadius:4,padding:"2px 6px",fontWeight:600}}>{instances.length}x</span>}
        {tag&&<span style={{fontSize:10,background:C.red+"18",color:C.red,borderRadius:4,padding:"2px 6px",fontWeight:600}}>{tag}</span>}
        {anyOn&&<span style={{color:C.dim,fontSize:11}}>{open?"▲":"▼"}</span>}
      </div>
      {anyOn&&open&&(
        <div style={{padding:"12px 14px 14px",background:"#fff"}}>
          {instances.map((inst,idx)=>(
            <TestInstance key={"ti-"+inst.id}
              inst={inst} idx={idx} total={instances.length}
              Form={Form} formProps={formProps}
              onUpdate={onUpdate} onRemove={onRemove}/>
          ))}
          <button onClick={onAdd}
            style={{width:"100%",marginTop:8,background:"none",border:"1px dashed "+C.border,
              borderRadius:7,color:C.accent,padding:"7px 0",cursor:"pointer",fontSize:11,fontWeight:600}}>
            + Add Additional Test
          </button>
        </div>
      )}
      {anyOn&&!open&&(
        <div style={{padding:"3px 14px 7px",cursor:"pointer",background:"#fdf3f2"}}
          onClick={()=>setOpen(true)}>
          <span style={{fontSize:10,color:C.redDim}}>
            {instances.length>1?instances.length+"x tests — ":""}click to expand ▼
          </span>
        </div>
      )}
    </div>
  );
}

// ── Form components ───────────────────────────────────────────────────────────
function VibForm({s,set,setup}){
  const pm=s.pia||1;
  const std=sf(s.stdSetup||s.setup||1250);
  const dr=Math.round(sf(setup.holes)*0.5*sf(setup.techRate,175)*(setup.drillTap?1.5:1));
  const fab=Math.round(sf(setup.fabHours)*sf(setup.techRate,175));
  const addl=sf(s.addlCosts,0);
  const setupTotal=std+dr+fab+addl;
  return <div>
    <div style={{fontSize:10,color:C.muted,marginBottom:6,fontWeight:600}}>MIL-STD-167</div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <Row label="Freq Range"><Inp value={s.freqRange||""} onChange={v=>set({...s,freqRange:v})} width={120}/>
      <span style={{fontSize:11,color:C.muted}}>Hz</span>
    </Row>
    <Pia s={s} set={set}/>
    <Toggle small checked={s.circ||false} onChange={v=>set({...s,circ:v})} label="Circulating System (+$2,500)"/>
    <div style={{display:"flex",gap:16,marginTop:6,flexWrap:"wrap"}}>
      <Toggle small checked={s.hydroPre||false} onChange={v=>set({...s,hydroPre:v})} label="Pre-Test Hydrostatic"/>
      <Toggle small checked={s.hydroPost||false} onChange={v=>set({...s,hydroPost:v})} label="Post-Test Hydrostatic"/>
    </div>
    <HR/>
    <PRow label="Std Setup" val={s.stdSetup||s.setup||"1250"} onChange={v=>set({...s,stdSetup:v})}/>
    <PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>
    <PRow label={"Testing"+(pm>1?" (x"+pm+")":"")} val={s.testing} onChange={v=>set({...s,testing:v})}/>
    {(s.hydroPre||s.hydroPost)&&<PRow label="Hydrostatic" val={s.hydroPrice||"500"} onChange={v=>set({...s,hydroPrice:v})}/>}
    <div style={{fontSize:10,background:C.panel,borderRadius:5,padding:"5px 8px",marginBottom:6}}>
      <span style={{color:C.dim}}>Setup: </span>
      <span style={{color:C.text,fontWeight:600}}>{money(setupTotal)}</span>
      <span style={{color:C.dim,fontSize:9}}>{" = "}{"$"+sf(s.stdSetup||s.setup||1250).toLocaleString()}{dr>0?" + $"+dr.toLocaleString()+" drill":""}{fab>0?" + $"+fab.toLocaleString()+" fab":""}{addl>0?" + $"+addl.toLocaleString()+" addl":""}{pm>1?" x "+pm+" PIA":""}</span>
    </div>
    <ProcReport s={s} set={set} sectionCode="94"/>
  </div>;
}

function ShockForm({s,set,vibSetup,setup,ti}){
  const disc=s.cat==="Medium Weight"?mwDisc(vibSetup):lwDisc(vibSetup);
  const pm=s.pia||1;
  const dr=Math.round(sf(setup.holes)*0.5*sf(setup.techRate,175)*(setup.drillTap?1.5:1));
  const fab=Math.round(sf(setup.fabHours)*sf(setup.techRate,175));
  const std=s.fromVib&&vibSetup>0?disc:sf(s.stdSetup||s.setup||1500);
  const addl=sf(s.addlCosts,0);
  const setupTotal=s.fromVib&&vibSetup>0?disc:std+dr+fab+addl;
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <Row label="Category">
      <Sel value={s.cat} onChange={v=>set({...s,cat:v,testing:v==="Medium Weight"?"4575":"1350",stdSetup:v==="Medium Weight"?"1500":"1250"})}
        options={["Medium Weight","Lightweight"]} width={160}/>
    </Row>
    <Row label="Grade"><Inp value={s.grade||""} onChange={v=>set({...s,grade:v})} width={60}/></Row>
    <Row label="Class"><Inp value={s.class_||""} onChange={v=>set({...s,class_:v})} width={60}/></Row>
    <Row label="Type"><Inp value={s.type_||""} onChange={v=>set({...s,type_:v})} width={60}/></Row>
    <Row label="Location">
      <Sel value={s.location||"Hull"} onChange={v=>set({...s,location:v})}
        options={["Hull","Deck","Hull/Deck","Conventional Deck","Mitigated Deck","Isolated Deck","Shell","Wetted-Surface","Frame"]} width={220}/>
    </Row>
    <div style={{marginBottom:8,marginTop:-4}}>
      <Toggle small checked={s.submarine||false} onChange={v=>set({...s,submarine:v})} label="Submarine"/>
    </div>
    <Row label="Orientation">
      <Sel value={s.orientation||"Unrestricted"} onChange={v=>set({...s,orientation:v})}
        options={["Unrestricted","Vertical Axis Specified","Restricted","Custom","Unknown"]} width={180}/>
    </Row>
    <Row label="# Blows">
      <Inp value={s.blows||""} onChange={v=>set({...s,blows:v})} width={60}/>
      <span style={{fontSize:10,color:C.dim,marginLeft:6}}>leave blank if standard</span>
    </Row>
    {s.cat==="Medium Weight"&&(
      <Row label="Unit Weight (lbs)">
        <Inp value={s.weight||(ti?.wt||"")} onChange={v=>set({...s,weight:v,testing:v&&sf(v)>0?String(mwTesting(sf(v))):s.testing})} width={80}/>
        <span style={{fontSize:10,color:C.dim,marginLeft:6}}>{ti?.wt&&!s.weight?"from unit details":"auto-sets testing price"}</span>
      </Row>
    )}
    <Pia s={s} set={set}/>
    <Toggle small checked={s.fromVib||false} onChange={v=>set({...s,fromVib:v})} label="Moving from Vib (discounted setup)"/>
    <Toggle small checked={s.circ||false} onChange={v=>set({...s,circ:v})} label="Circulating System"/>
    <div style={{display:"flex",gap:16,marginTop:6,flexWrap:"wrap"}}>
      <Toggle small checked={s.hydroPre||false} onChange={v=>set({...s,hydroPre:v})} label="Pre-Test Hydrostatic"/>
      <Toggle small checked={s.hydroPost||false} onChange={v=>set({...s,hydroPost:v})} label="Post-Test Hydrostatic"/>
    </div>
    <HR/>
    {!(s.fromVib&&vibSetup>0)&&<PRow label="Std Setup" val={s.stdSetup||s.setup||"1500"} onChange={v=>set({...s,stdSetup:v})}/>}
    {!(s.fromVib&&vibSetup>0)&&<PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>}
    <PRow label={"Testing"+(pm>1?" (x"+pm+")":"")+(s.cat==="Medium Weight"?" (auto: $"+mwTesting(sf(s.weight||ti?.wt||0)).toLocaleString()+")":"")} val={s.testing} onChange={v=>set({...s,testing:v})}/>
    {s.cat==="Medium Weight"&&<div style={{fontSize:10,color:C.dim,marginBottom:4}}>Weight-based: ≤2,500lb $4,575 · 2,501–3,500lb $5,575 · &gt;3,500lb $6,250<br/>Set weight in Unit Details above to auto-suggest.</div>}
    {(s.hydroPre||s.hydroPost)&&<PRow label="Hydrostatic (each)" val={s.hydroPrice||"500"} onChange={v=>set({...s,hydroPrice:v})}/>}
    <div style={{fontSize:10,background:C.panel,borderRadius:5,padding:"5px 8px",marginBottom:6}}>
      <span style={{color:C.dim}}>Setup: </span>
      <span style={{color:C.text,fontWeight:600}}>{money(setupTotal)}</span>
      {s.fromVib&&vibSetup>0
        ? <span style={{color:C.dim,fontSize:9}}>{" (discounted from vib setup $"+vibSetup.toLocaleString()+")"}</span>
        : <span style={{color:C.dim,fontSize:9}}>{" = $"+sf(s.stdSetup||s.setup||1500).toLocaleString()+(dr>0?" + $"+dr.toLocaleString()+" drill":"")+(fab>0?" + $"+fab.toLocaleString()+" fab":"")+(addl>0?" + $"+addl.toLocaleString()+" addl":"")+(pm>1?" x "+pm+" PIA":"")}</span>
      }
    </div>
    <ProcReport s={s} set={set} sectionCode={s.cat==="Medium Weight"?"91":"92"}/>
  </div>;
}

function NoiseForm({s,set,setup,ti}){
  const base=s.durUnit==="hours"?NOISE_BASE_60:NOISE_BASE_30;
  const COMP_COST={"<=140dB":0,"145dB":0,"150dB":0,"155dB":1500,"160dB":1500,"165dB":2000,"170dB":3500};
  const autoComp=COMP_COST[s.level]||0;
  const compCost=sf(s.compBudget,autoComp);
  const compUp=compCost*1.25;
  // Testing price = base level price + compressor markup (NO setup rolled in)
  const autoTesting=(base[s.level]||0)+compUp;
  // Setup price = chamber standard setup
  const chamberSetup=NOISE_FAC[s.chamber]||1000;
  const pm=s.pia||1;
  // Chamber recommendation based on unit dims AND dB level
  const L=sf(ti?.dimL,0), W=sf(ti?.dimW,0), H=sf(ti?.dimH,0);
  const cuIn=L*W*H;
  const cuFt=cuIn/1728;
  const dbNum=s.level==="<=140dB"?140:parseInt(s.level)||0;

  // Determine recommended chamber per spec:
  // Speakerbox:        ≤500 in³ AND ≤145 dB
  // 64 Reverb:         ≤6.4 ft³ (no dB cap)
  // 300 Reverb:        ≤30 ft³  AND ≤165 dB
  // Prog Wave Tube:    H≤40" AND W≤40" AND ≤165 dB
  // (>165 dB in any chamber: disclaimer about custom build)
  const fitsSpkr  = cuIn>0 && cuIn<=500  && dbNum<=145;
  const fits64    = cuIn>0 && cuFt<=6.4;
  const fits300   = cuIn>0 && cuFt<=30   && dbNum<=165;
  const fitsPWT   = cuIn>0 && H<=40 && W<=40 && dbNum<=165;
  const over165   = dbNum>165;

  const chamberRec = cuIn>0 ? (
    fitsSpkr  ? "Speakerbox" :
    fits64    ? "64 Reverb Chamber" :
    fits300   ? "300 Reverb Chamber" :
    fitsPWT   ? "Prog Wave Tube" :
    over165   ? "Prog Wave Tube" : // show with disclaimer
    "Prog Wave Tube"
  ) : "";

  // Is the currently selected chamber valid for this unit?
  const chamberOk = !cuIn || (
    s.chamber==="Speakerbox"         ? fitsSpkr  :
    s.chamber==="64 Reverb Chamber"  ? fits64    :
    s.chamber==="300 Reverb Chamber" ? fits300   :
    s.chamber==="Prog Wave Tube"     ? fitsPWT   :
    false
  );

  // Disclaimer for >165dB
  const highDbDisclaimer = over165
    ? "⚠ Levels above 165dB: NU Labs can build a new chamber to accommodate depending on size — contact us to discuss."
    : null;
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <Row label="OASPL (pricing)">
      <Sel value={s.level} onChange={v=>{const nb=s.durUnit==="hours"?NOISE_BASE_60:NOISE_BASE_30;set({...s,level:v,compBudget:String(COMP_COST[v]||0),testing:String(Math.round((nb[v]||0)+(COMP_COST[v]||0)*1.25))});}}
        options={["<=140dB","145dB","150dB","155dB","160dB","165dB","170dB"]} width={110}/>
    </Row>
    <Row label="OASPL (spec)"><Inp value={s.oaspl||""} onChange={v=>set({...s,oaspl:v})} width={90}/></Row>
    <Row label="Chamber">
      <Sel value={s.chamber} onChange={v=>set({...s,chamber:v,stdSetup:String(NOISE_FAC[v]||1000)})}
        options={["Speakerbox","64 Reverb Chamber","300 Reverb Chamber","Prog Wave Tube"]} width={200}/>
    </Row>
    {cuIn>0&&(
      <div style={{fontSize:10,borderRadius:5,padding:"4px 8px",marginBottom:6,
        background:chamberOk?"#f0fdf4":"#fdf3f2",color:chamberOk?"#15803d":C.red}}>
        {(()=>{
          // Check dB range for selected chamber
          const dbOk=
            s.chamber==="Speakerbox"?dbNum<=145:
            s.chamber==="64 Reverb Chamber"?true:
            s.chamber==="300 Reverb Chamber"?dbNum<=165:
            s.chamber==="Prog Wave Tube"?dbNum<=165:true;
          // Check size — 10% of chamber volume allowance
          // Chamber volumes: Speakerbox ~500 in³, 64 Reverb ~6.4 ft³=11059 in³, 300 Reverb ~30 ft³=51840 in³, PWT: H≤40" W≤40"
          const chamberVol={"Speakerbox":500,"64 Reverb Chamber":6.4*1728,"300 Reverb Chamber":30*1728,"Prog Wave Tube":null};
          const vol=chamberVol[s.chamber];
          const sizeOk=s.chamber==="Prog Wave Tube"?(H<=40&&W<=40):(vol?cuIn<=vol:true);
          const at10=vol?cuIn>vol*0.9:false; // within 10% of limit
          return(<>
            {!dbOk&&<div style={{color:C.red,fontWeight:600}}>⚠ OASPL is not within standard range of this chamber — check with production.</div>}
            {!sizeOk&&<div style={{color:C.red,fontWeight:600}}>⚠ This unit exceeds the chamber volume allowance — check with production.</div>}
            {sizeOk&&at10&&<div style={{color:C.warn,fontWeight:600}}>⚠ Unit is within 10% of chamber volume limit — check with production.</div>}
            {dbOk&&sizeOk&&!at10&&<div style={{color:"#15803d"}}>✓ {s.chamber} is suitable for this unit ({cuIn.toFixed(0)} in³ / {cuFt.toFixed(2)} ft³)</div>}
            {!chamberOk&&chamberRec&&<button onClick={()=>set({...s,chamber:chamberRec})}
              style={{marginTop:4,fontSize:9,background:"none",border:"1px solid "+C.red,borderRadius:4,
                color:C.red,cursor:"pointer",padding:"1px 5px",display:"block"}}>Switch to recommended: {chamberRec}</button>}
            {highDbDisclaimer&&<div style={{marginTop:4,color:C.warn,fontWeight:600}}>{highDbDisclaimer}</div>}
          </>);
        })()}
      </div>
    )}

    <Row label="Duration">
      <Inp value={s.durVal} onChange={v=>set({...s,durVal:v})} width={55}/>
      <Sel value={s.durUnit} onChange={v=>set({...s,durUnit:v})} options={["minutes","hours"]} width={85}/>
    </Row>
    <Row label="Compressor ($)">
      <Inp value={s.compBudget!==undefined?s.compBudget:String(autoComp)} onChange={v=>set({...s,compBudget:v})} width={80}/>
      <span style={{fontSize:10,color:autoComp>0?C.warn:C.dim,marginLeft:4}}>
        {autoComp>0?"auto: $"+autoComp.toLocaleString()+" → $"+Math.round(autoComp*1.25).toLocaleString()+" w/markup":"25% markup applied"}
      </span>
    </Row>
    <Pia s={s} set={set}/>
    <HR/>
    <PRow label={"Std Setup (auto: "+money(chamberSetup)+")"} val={s.stdSetup||String(chamberSetup)} onChange={v=>set({...s,stdSetup:v})}/>
    <PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>
    <PRow label={"Testing (auto: "+money(autoTesting)+")"} val={s.testing} onChange={v=>set({...s,testing:v})}/>
    {s.level==="170dB"&&(
      <div style={{fontSize:11,color:C.warn,marginBottom:6}}>⚠ 170dB performed as best effort</div>
    )}
    <ProcReport s={s} set={set} sectionCode="11"/>
  </div>;
}

function EnvForm({s,set}){
  const ENV_ITEMS=[
    {key:"th",label:"Temperature & Humidity",setup:500,testing:1000,td:500},
    {key:"sf",label:"Salt Fog (96 hrs)",setup:0,testing:1750,td:500},
    {key:"alt",label:"Altitude",setup:500,testing:1000,td:500},
    {key:"ess",label:"ESS",setup:0,testing:1000,td:500},
    {key:"acc",label:"Acceleration",setup:2000,testing:1950,td:750},
    {key:"incl",label:"Inclination",setup:1250,testing:1750,td:500},
    {key:"rd",label:"Rapid Decompression",setup:1000,testing:2275,td:500},
    {key:"ed",label:"Explosive Decompression",setup:1250,testing:2450,td:500},
    {key:"drip",label:"Drip Test",setup:500,testing:750,td:300},
    {key:"sub",label:"Submergence",setup:500,testing:750,td:300},
    {key:"spray",label:"Spray Test",setup:1250,testing:1250,td:500},
  ];
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
      {ENV_ITEMS.map(({key,label,setup,testing,td})=>{
        const checked=s.items?.[key]?.on||false;
        return(
          <div key={key} style={{background:checked?"#fdf3f2":C.panel,
            border:"1px solid "+(checked?C.red+"44":C.border),borderRadius:7,padding:"7px 10px"}}>
            <Toggle small checked={checked}
              onChange={v=>set({...s,items:{...s.items,[key]:{...(s.items?.[key]||{}),on:v,setup:String(setup),testing:String(testing),td:String(td)}}})}
              label={label}/>
          </div>
        );
      })}
    </div>
    {/* Per-item detail panels for active tests */}
    {[
      {key:"th",label:"Temperature & Humidity"},
      {key:"sf",label:"Salt Fog (96 hrs)"},
      {key:"alt",label:"Altitude"},
      {key:"ess",label:"ESS"},
      {key:"acc",label:"Acceleration"},
      {key:"incl",label:"Inclination"},
      {key:"rd",label:"Rapid Decompression"},
      {key:"ed",label:"Explosive Decompression"},
      {key:"drip",label:"Drip Test"},
      {key:"sub",label:"Submergence"},
      {key:"spray",label:"Spray Test"},
    ].filter(({key})=>s.items?.[key]?.on).map(({key,label})=>{
      const item=s.items[key];
      const upd=patch=>set({...s,items:{...s.items,[key]:{...item,...patch}}});
      return(
        <div key={key} style={{background:C.panel,borderRadius:7,padding:"8px 10px",marginBottom:6,border:"1px solid "+C.red+"33"}}>
          <div style={{fontSize:10,color:C.red,fontWeight:700,marginBottom:6}}>{label}</div>
          <Row label="Spec" mb={6}>
            <Inp value={item.spec||""} onChange={v=>upd({spec:v})} width={200}/>
          </Row>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {item.setup!=="0"&&item.setup!==undefined&&<div>
              <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Setup ($)</div>
              <Inp value={item.setup||"0"} onChange={v=>upd({setup:v})} width={80}/>
            </div>}
            <div>
              <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Testing ($)</div>
              <Inp value={item.testing||"0"} onChange={v=>upd({testing:v})} width={80}/>
            </div>
          </div>
          {key==="th"&&<>
            <Row label="Duration" mb={4}>
              <Sel value={s.thDur||"0 to 1 Day"} onChange={v=>set({...s,thDur:v})} options={Object.keys(ENV_TH_PRICES)} width={130}/>
            </Row>
            <Row label="Custom Duration" mb={4}>
              <Inp value={s.thDurVal||""} onChange={v=>set({...s,thDurVal:v})} width={60} placeholder="e.g. 24"/>
              <Sel value={s.thDurUnit||"hours"} onChange={v=>set({...s,thDurUnit:v})}
                options={["minutes","hours","days"]} width={90}/>
              <span style={{fontSize:9,color:C.dim,marginLeft:4}}>→ used in spec text</span>
            </Row>
            <Row label="Type" mb={0}>
              <Sel value={s.thType||"Temperature & Humidity"} onChange={v=>set({...s,thType:v})}
                options={["Temperature & Humidity","Temperature Only","Humidity Only"]} width={200}/>
            </Row>
          </>}
          {key==="alt"&&<Row label="Dwell" mb={0}>
            <Sel value={s.altDwell||"1-30 min"} onChange={v=>set({...s,altDwell:v})}
              options={["1-30 min","31-60 min","1-2 hr"]} width={120}/>
          </Row>}
          {key==="ess"&&<Row label="Duration/Axis" mb={0}>
            <Inp value={s.essDur||"10 minutes"} onChange={v=>set({...s,essDur:v})} width={120}/>
          </Row>}
        </div>
      );
    })}
    <Pia s={s} set={set}/>
    <ProcReport s={s} set={set} sectionCode="53"/>
  </div>;
}

function calcEmiShifts(s){
  const L=sf(s.dimL)*2.54, W=sf(s.dimW)*2.54, H=sf(s.dimH)*2.54;
  const cables=Math.max(1,sf(s.cables,1));
  const phases=Math.max(1,sf(s.phases||3,3));
  const pwrCables=phases===1?3:4;
  const ru=x=>x>0?Math.ceil(x):0;
  const rp=x=>Math.max(1,Math.ceil(x)); // round up, minimum 1 position
  const res={};
  res.CE101={raw:1.0,rounded:1.0,bd:[["Fixed",1.0]]};
  res.CE102={raw:1.0,rounded:1.0,bd:[["Fixed",1.0]]};
  res.CS101={raw:1.5,rounded:1.5,bd:[["Fixed",1.5]]};
  res.CS106={raw:1.5,rounded:1.5,bd:[["Fixed",1.5]]};
  const cs114=1.5+((120*cables)/60)/8+((pwrCables*120)/60)/8;
  res.CS114={raw:cs114,rounded:ru(cs114),
    sigTests:cables, pwrTests:pwrCables+1, totalTests:cables+(pwrCables+1),
    bd:[["Setup/Cal",1.5],["Signal cables (120min x "+cables+")",((120*cables)/60)/8],["Power cables ("+pwrCables+"x120min)",((pwrCables*120)/60)/8]]};
  // CS109 — Structure Current; fixed 1.0 shift placeholder (update when lab time confirmed)
  res.CS109={raw:1.0,rounded:1.0,bd:[["Placeholder — confirm lab time",1.0]]};
  // CS115 — Impulse Excitation; same test count as CS114, 5 min per test, 0.5 shift setup/cal
  const cs115Total=cables+(pwrCables+1);
  const cs115=0.5+((5*cs115Total)/60)/8;
  res.CS115={raw:cs115,rounded:ru(cs115),
    sigTests:cables, pwrTests:pwrCables+1, totalTests:cs115Total,
    bd:[["Setup/Cal",0.5],["Tests (5min x "+cs115Total+")",((5*cs115Total)/60)/8]]};
  const cs116=1.0+((90*cables)/60)/8+((pwrCables*120)/60)/8;
  res.CS116={raw:cs116,rounded:ru(cs116),
    sigTests:cables, pwrTests:pwrCables+1, totalTests:cables+(pwrCables+1),
    bd:[["Setup/Cal/Sweep",1.0],["Signal cables (90min x "+cables+")",((90*cables)/60)/8],["Power cables",((pwrCables*120)/60)/8]]};
  const re101=L<50?2.0:2.5;
  res.RE101={raw:re101,rounded:ru(re101),bd:[["L="+L.toFixed(1)+"cm ("+(L<50?"<":">=")+"50cm)",re101]]};

  // RE102 — shifts and positions per band
  // Positions: ceil((L+7)/ref) + ceil(W/ref) per band, min 1 each side
  const p21=Math.max(0.0125,((L+7)/93)*0.0125),p22=Math.max(0.0125,(W/93)*0.0125);
  const p23=Math.max(0.032,((L+7)/52)*0.032),p24=Math.max(0.032,((W+7)/52)*0.032);
  const p25=Math.max(0.0073,((L+7)/14)*0.0073),p26=Math.max(0.0073,((W+7)/14)*0.1173);
  const re102=1.5+(p21+p22)+(p23+p24)+(p25+p26);
  const re102Pos={
    sub1GHz: 1, // always 1 below 1 GHz
    b1_4:    rp((L+7)/93)+rp(W/93),
    b4_15:   rp((L+7)/52)+rp((W+7)/52),
    b15_18:  rp((L+7)/14)+rp((W+7)/14),
  };
  res.RE102={raw:re102,rounded:ru(re102),pos:re102Pos,
    bd:[["Cal/Test <=1GHz",1.5],["1-4 GHz",p21+p22],["4-15 GHz",p23+p24],["15-18 GHz",p25+p26]]};

  // RS101 — positions based on face areas (each 30cmx30cm = 1 pos)
  const rs101=1.0+(((L*W)*2)/900*22)/60/8+(((L*H)*2)/900*22)/60/8+(((W*H)*2)/900*22)/60/8;
  const rs101Pos={
    LW: Math.max(1,Math.ceil((L*W)/900))*2,
    LH: Math.max(1,Math.ceil((L*H)/900))*2,
    WH: Math.max(1,Math.ceil((W*H)/900))*2,
    get total(){ return this.LW+this.LH+this.WH; }
  };
  res.RS101={raw:rs101,rounded:ru(rs101),pos:rs101Pos,
    bd:[["Cal/Setup",1.0],["LxW sides",+(((L*W)*2)/900*22/60/8).toFixed(4)],["LxH sides",+(((L*H)*2)/900*22/60/8).toFixed(4)],["WxH sides",+(((W*H)*2)/900*22/60/8).toFixed(4)]]};

  // RS103 — shifts and positions per band
  // Positions: ceil((L+7)/ref) + ceil(W/ref) per band
  const n35=((2*16)/60)/8,n36=(25/60)/8;
  const p37=Math.max(0.04375,(L/89.5)*0.04375),p38=Math.max(0.04375,(W/89.5)*0.04375);
  const p39=Math.max(0.154,(L/93)*0.154),p40=Math.max(0.154,(W/93)*0.154);
  const p41=Math.max(0.052,(L/50)*0.052),p42=Math.max(0.052,(W/50)*0.052);
  const rs103=3.0+n35+n36+(p37+p38)+(p39+p40)+(p41+p42);
  const rs103Pos={
    b2_30:   2, // fixed per spec
    b30_200: 1, // fixed per spec
    b200_1G: rp(L/89.5)+rp(W/89.5),
    b1_4:    rp(L/93)+rp(W/93),
    b4_18:   rp(L/50)+rp(W/50),
  };
  res.RS103={raw:rs103,rounded:ru(rs103),pos:rs103Pos,
    bd:[["Setup/Field Adj/Antenna",3.0],["2-30 MHz",n35],["30-200 MHz",n36],["200MHz-1GHz",p37+p38],["1-4 GHz",p39+p40],["4-18 GHz",p41+p42]]};

  // RS105 fixed
  res.RS105={raw:1.5,rounded:1.5,bd:[["Fixed",1.5]]};
  return res;
}

function EmiForm({s,set,ti}){
  // Auto-populate dims from Test Item Description if not manually set
  const autoL=ti?.dimL||""; const autoW=ti?.dimW||""; const autoH=ti?.dimH||"";
  const autoWt=ti?.wt||""; const autoCables=s.cables||"0";
  const autoPhases=ti?.phase||""; const autoVolt=ti?.volt||"";
  // Use instance value if set, else fall back to ti
  const dispL=s.dimL||autoL; const dispW=s.dimW||autoW; const dispH=s.dimH||autoH;
  const dispWt=s.weight||autoWt; const dispPhases=s.phases||autoPhases;
  // Rev-aware test list: F has CS106+RS105, G has CS109+CS115
  const isRevF=(s.revs||{})['Rev F']||false;
  const isRevG=(s.revs||{})['Rev G']||false;
  const TESTS_F=["CE101","CE102","CS101","CS106","CS114","CS116","RE101","RE102","RS101","RS103","RS105"];
  const TESTS_G=["CE101","CE102","CS101","CS109","CS114","CS115","CS116","RE101","RE102","RS101","RS103"];
  // If Rev G only → G list; if Rev F only or neither → F list; if both → combined
  const TESTS=isRevG&&!isRevF ? TESTS_G : !isRevG&&isRevF ? TESTS_F : isRevG&&isRevF ? [...new Set([...TESTS_F,...TESTS_G])] : TESTS_F;
  const TEST_LABELS={
    CE101:"Conducted Emissions, Power Leads",
    CE102:"Conducted Emissions, RF Potentials, Power Leads",
    CS101:"Conducted Susceptibility, Power Leads",
    CS106:"Conducted Susceptibility, Transients (461F)",
    CS109:"Conducted Susceptibility, Structure Current (461G)",
    CS114:"Conducted Susceptibility, Bulk Cable Injection",
    CS115:"Conducted Susceptibility, Bulk Cable Injection, Impulse (461G)",
    CS116:"Conducted Susceptibility, Damped Sinusoidal Transients",
    RE101:"Radiated Emissions, Magnetic Field",
    RE102:"Radiated Emissions, Electric Field",
    RS101:"Radiated Susceptibility, Magnetic Field",
    RS103:"Radiated Susceptibility, Electric Field",
    RS105:"Radiated Susceptibility, Transients (461F)",
  };
  const PLATS=["Surface Ships","Submarines"];
  const LOCS_CAN=[
    "Below Deck","Subs Internal",
    "Aircraft Fixed Wing Internal ≥25m",
    "Ground Navy Fixed","Ground Air Force","Space System Internal",
  ];
  const LOCS_TBD=[
    "High-Gain Preamp (≥48 dB) — Feasibility TBD",
  ];
  const LOCS_CANT=[
    "Above Deck","Subs External",
    "Aircraft Fixed Wing Internal <25m","Aircraft Fixed Wing External",
    "Ground Navy Mobile","Ground Army",
  ];
  const LOCS=[...LOCS_CAN,...LOCS_TBD,...LOCS_CANT];
  const REVS=["Rev F","Rev G"];
  const [expanded,setExpanded]=useState({});

  // ── Unit detail values for warning logic ──
  const eutAmps   = sf(s.phases&&s.phases?s.phases:ti?.phase||'3',3)>=1 ? sf(ti?.amps||'0',0) : 0;
  const eutHz     = sf(ti?.hz||'0',0);
  const isSub          = (s.plats||{})['Submarines']||false;
  const isAboveDeck    = (s.locs||{})['Above Deck']||false;
  const isBelowDeck    = (s.locs||{})['Below Deck']||false;
  const isSubsInternal = (s.locs||{})['Subs Internal']||false;
  const isSubsExternal = (s.locs||{})['Subs External']||false;
  const isGndNavyFixed = (s.locs||{})['Ground Navy Fixed']||false;
  const isGndNavyMob   = (s.locs||{})['Ground Navy Mobile']||false;
  const isGndArmy      = (s.locs||{})['Ground Army']||false;
  const isGndAF        = (s.locs||{})['Ground Air Force']||false;
  const isAircraftIntBig  = (s.locs||{})['Aircraft Fixed Wing Internal ≥25m']||false;
  const isAircraftIntSm   = (s.locs||{})['Aircraft Fixed Wing Internal <25m']||false;
  const isAircraftExt  = (s.locs||{})['Aircraft Fixed Wing External']||false;
  const isSpaceInt     = (s.locs||{})['Space System Internal']||false;
  const isPreampTBD    = (s.locs||{})['High-Gain Preamp (≥48 dB) — Feasibility TBD']||false;
  const isDC           = (ti?.pwrType||'AC')==='DC';

  // ── Per-test flags: { greyed: bool, greyReason: string, warnings: string[] } ──
  const getTestFlags=(t)=>{
    const warnings=[];
    let greyed=false, greyReason='';

    if(t==='CS101'){
      if(isRevF && eutAmps>0 && eutAmps>100){
        greyed=true; greyReason='CS101 generally does not apply for EUT currents >100 A/phase (Rev F).';
      } else if(isRevG && eutAmps>0 && eutAmps>30 && eutHz>150000){
        greyed=true; greyReason='CS101 generally does not apply for >30 A/phase when operating frequency >150 kHz (Rev G).';
      } else if(isRevG && eutAmps>0 && eutAmps>30){
        warnings.push('Rev G: CS101 applies for >30 A/phase only if operating frequency ≤150 kHz AND sensitivity better than 1 µV. Verify before including.');
      }
      if(eutAmps>0 && eutAmps>18){
        warnings.push('Amplifier limit: transformer secondary current max ~23 A. Feasibility should be checked at time of test if EUT current is close to this limit.');
      }
    }

    if(t==='CS109'){
      // CS109 is never performed by NU Labs — always show as non-selectable
      greyed=true;
      greyReason=eutHz>0&&eutHz>100000
        ?'CS109 does not apply for operating frequency >100 kHz.'
        :'NU Labs does not perform CS109. This test must be subcontracted if required.';
    }

    if(t==='RS101'){
      if(eutHz>0 && eutHz>100000){
        greyed=true; greyReason='RS101 does not apply for operating frequency >100 kHz.';
      } else {
        warnings.push('RS101 applicability requires operating frequency ≤100 kHz AND sensitivity better than 1 µV. Verify with customer before including.');
        if(isSub) warnings.push('Army curve is feasible but pushes our Crown 5002 amp to its limits. Navy curve is OK.');
      }
    }

    if(t==='RS103'){
      warnings.push('NU Labs RS103 capability is limited to 10 V/m (Ships metallic below deck / Subs internal). Max frequency: 18 GHz.');
      if(isAboveDeck){
        warnings.push('Ships above deck / exposed below deck (50 V/m 2–30 MHz) requires a rented 500 W amp — subcontract or add rental cost.');
      }
      if(isSubsExternal||isAircraftExt||isGndNavyMob||isGndArmy){
        warnings.push('Selected location may require higher field strengths (>10 V/m) — verify limits with customer. Subcontracting may be required.');
      }
    }

    if(t==='RE102'){
      const re102Sub = isAboveDeck||isSubsExternal||isAircraftIntSm||isAircraftExt||isGndNavyMob||isGndArmy;
      if(re102Sub){
        greyed=true;
        greyReason='RE102 subcontract required for selected location(s): '
          +[isAboveDeck&&'Ships Above Deck',isSubsExternal&&'Subs External',
            isAircraftIntSm&&'Aircraft Fixed Wing Internal <25m',isAircraftExt&&'Aircraft Fixed Wing External',
            isGndNavyMob&&'Ground Navy Mobile',isGndArmy&&'Ground Army'].filter(Boolean).join(', ')+'.';
      } else {
        if(isAircraftIntBig) warnings.push('Aircraft Fixed Wing Internal ≥25 m: NU Labs can perform this in-house. Verify nose-to-tail length before quoting.');
        if(isSpaceInt) warnings.push('Space System Internal: May be doable — verify limits with production before committing.');
        if(isPreampTBD) warnings.push('High-gain preamp (≥48 dB) may extend RE102 capability for some limits. Feasibility not yet confirmed — check with production.');
        const re102CanDo=isBelowDeck||isSubsInternal||isGndNavyFixed||isGndAF||isAircraftIntBig||isSpaceInt||isPreampTBD;
        if(!re102CanDo) warnings.push('No location selected — verify RE102 applicability and limits with customer.');
      }
    }

    if(t==='RE101'){
      if(eutHz>0 && eutHz>100000){
        warnings.push('RE101 applicability should be verified for operating frequency >100 kHz.');
      }
    }

    if(isDC){
      if(['CS101','CS106','CS114','CS115','CS116'].includes(t)){
        warnings.push('EUT is DC powered — this test still applies but limits may differ. Confirm applicable figure with customer.');
      }
    }

    return {greyed, greyReason, warnings};
  };

  // Compute shifts from unit details dimensions
  const shifts=useMemo(()=>calcEmiShifts({dimL:dispL,dimW:dispW,dimH:dispH,cables:s.cables||"0",phases:dispPhases||"3"}),[dispL,dispW,dispH,s.cables,dispPhases]);

  const allSelected=TESTS.every(t=>s.tests?.[t]||false);
  const toggleAll=()=>{
    const v=!allSelected;
    const tests={};TESTS.forEach(t=>tests[t]=v);
    set({...s,tests});
  };

  const selCount=TESTS.filter(t=>s.tests?.[t]).length;
  const selShifts=TESTS.filter(t=>s.tests?.[t]).reduce((a,t)=>a+(shifts[t]?.rounded||0),0);
  const rate=sf(s.rate,EMI_SR);

  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <div style={{marginBottom:8}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Spec Revision</div>
      <div style={{display:"flex",gap:12}}>
        {REVS.map(r=>(
          <label key={r} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer"}}>
            <input type="checkbox" checked={(s.revs||{})[r]||false}
              onChange={e=>set({...s,revs:{...(s.revs||{}),[r]:e.target.checked}})}
              style={{accentColor:C.red,width:13,height:13}}/>
            <span style={{fontSize:11,color:(s.revs||{})[r]?C.red:C.muted}}>{r}</span>
          </label>
        ))}
      </div>
    </div>
    {(autoL||autoW||autoH)&&(
      <div style={{fontSize:10,color:C.accent,background:"#eef4fb",borderRadius:6,padding:"4px 8px",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
        <span>⟳</span>
        <span>{"Auto-filled from Test Item Description — override below if needed"}</span>
      </div>
    )}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
      <Row label="L (in)" mb={0}><Inp value={dispL} onChange={v=>set({...s,dimL:v})} width={60}/>{s.dimL&&<span style={{fontSize:9,color:C.dim,marginLeft:2}}>▲</span>}</Row>
      <Row label="W (in)" mb={0}><Inp value={dispW} onChange={v=>set({...s,dimW:v})} width={60}/>{s.dimW&&<span style={{fontSize:9,color:C.dim,marginLeft:2}}>▲</span>}</Row>
      <Row label="H (in)" mb={0}><Inp value={dispH} onChange={v=>set({...s,dimH:v})} width={60}/>{s.dimH&&<span style={{fontSize:9,color:C.dim,marginLeft:2}}>▲</span>}</Row>
      <Row label="Weight (lbs)" mb={0}><Inp value={dispWt} onChange={v=>set({...s,weight:v})} width={60}/></Row>
      <Row label="Cables" mb={0}><Inp value={s.cables||"0"} onChange={v=>set({...s,cables:v})} width={60}/></Row>
      <Row label="Phases" mb={0}><Inp value={dispPhases||"3"} onChange={v=>set({...s,phases:v})} width={60}/>{autoPhases&&!s.phases&&<span style={{fontSize:9,color:C.dim,marginLeft:2}}>auto</span>}</Row>
    </div>
    <Row label="Shift Rate ($)"><Inp value={s.rate} onChange={v=>set({...s,rate:v})} width={80}/></Row>
    <Row label="Addl Costs ($)"><Inp value={s.addl} onChange={v=>set({...s,addl:v})} width={80}/></Row>
    <Row label="Setup Shifts"><Inp value={s.setupShifts} onChange={v=>set({...s,setupShifts:v})} width={60}/></Row>
    <Row label="Teardown Shifts"><Inp value={s.tdShifts} onChange={v=>set({...s,tdShifts:v})} width={60}/></Row>
    <div style={{marginBottom:8}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Platform</div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        {PLATS.map(p=><Toggle key={p} small checked={(s.plats||{})[p]||false}
          onChange={v=>set({...s,plats:{...(s.plats||{}),[p]:v}})} label={p}/>)}
      </div>
    </div>
    <div style={{marginBottom:8}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Location / RE102 Limits</div>
      <div style={{marginBottom:6}}>
        <div style={{fontSize:9,color:"#166534",fontWeight:700,marginBottom:4,letterSpacing:.5}}>✓ IN-HOUSE CAPABLE</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {LOCS_CAN.map(l=><Toggle key={l} small checked={(s.locs||{})[l]||false}
            onChange={v=>set({...s,locs:{...(s.locs||{}),[l]:v}})} label={l}/>)}
        </div>
      </div>
      <div style={{marginBottom:6}}>
        <div style={{fontSize:9,color:"#b7791f",fontWeight:700,marginBottom:4,letterSpacing:.5}}>? FEASIBILITY TBD</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {LOCS_TBD.map(l=><Toggle key={l} small checked={(s.locs||{})[l]||false}
            onChange={v=>set({...s,locs:{...(s.locs||{}),[l]:v}})} label={l}/>)}
        </div>
      </div>
      <div>
        <div style={{fontSize:9,color:C.red,fontWeight:700,marginBottom:4,letterSpacing:.5}}>✗ SUBCONTRACT REQUIRED</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {LOCS_CANT.map(l=><Toggle key={l} small checked={(s.locs||{})[l]||false}
            onChange={v=>set({...s,locs:{...(s.locs||{}),[l]:v}})} label={l}/>)}
        </div>
      </div>
    </div>
    <Pia s={s} set={set}/>
    <HR/>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
      <div style={{fontSize:11,color:C.muted,fontWeight:600}}>TESTS ({selCount}/{TESTS.length} selected, {selShifts} shifts)</div>
      <button onClick={toggleAll}
        style={{background:"none",border:"1px solid "+C.border,borderRadius:5,padding:"2px 10px",
          cursor:"pointer",fontSize:11,color:allSelected?C.red:C.accent,fontWeight:600}}>
        {allSelected?"Deselect All":"Select All"}
      </button>
    </div>
    {TESTS.map(t=>{
      const on=s.tests?.[t]||false;
      const sh=shifts[t];
      const isExp=expanded[t]||false;
      const {greyed,greyReason,warnings}=getTestFlags(t);
      // Determine row state: greyed=N/A (red), hasWarning=amber, else green
      const hasWarnings=warnings.length>0;
      const rowBg=greyed?(on?"#fef2f2":C.panel):hasWarnings?(on?"#fffbeb":C.panel):(on?"#f0fdf4":C.panel);
      const rowBorder=greyed?"#fca5a5":hasWarnings?(on?"#b7791f":C.border):(on?"#86efac":C.border);
      const keyColor=greyed?C.muted:hasWarnings?(on?"#92400e":C.text):(on?"#166534":C.text);
      const labelColor=greyed?C.dim:hasWarnings?(on?"#b45309":C.dim):(on?"#15803d":C.dim);
      return <div key={t} style={{marginBottom:4}}>
        <div style={{display:"flex",alignItems:"center",gap:6,
          background:rowBg,
          border:"1px solid "+rowBorder,
          borderRadius:6,padding:"5px 8px",
          opacity:greyed?0.7:1}}>
          <input type="checkbox" checked={on}
            onChange={e=>set({...s,tests:{...s.tests,[t]:e.target.checked}})}
            disabled={t==="CS109"}
            style={{accentColor:greyed?C.red:hasWarnings?"#b7791f":"#166534",width:13,height:13,flexShrink:0,cursor:t==="CS109"?"not-allowed":"pointer"}}/>
          <span style={{fontSize:11,fontWeight:600,color:keyColor,minWidth:50}}>{t}</span>
          <span style={{fontSize:10,color:labelColor,flex:1,marginLeft:2}}>{TEST_LABELS[t]||""}</span>
          {greyed&&<span style={{fontSize:9,color:"#6b7a8d",background:"#e8ecf0",borderRadius:4,padding:"1px 5px",flexShrink:0}}>N/A</span>}
          {sh&&!greyed&&<span style={{fontSize:10,color:C.muted,flexShrink:0,marginLeft:4}}>
            {sh.rounded} shift{sh.rounded!==1?"s":""}
          </span>}
          {t==="RS103"&&on&&(
            <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:4}}>
              <span style={{fontSize:10,color:C.warn,flexShrink:0}}>Amp $</span>
              <input type="text" value={s.rs103amp||"5000"}
                onChange={e=>set({...s,rs103amp:e.target.value})}
                style={{...inp,width:60,fontSize:10,padding:"2px 5px"}}/>
            </div>
          )}
          {sh&&sh.bd&&<button onClick={()=>setExpanded({...expanded,[t]:!isExp})}
            style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,padding:"0 4px"}}>
            {isExp?"▲":"▼"}
          </button>}
        </div>
        {/* Grey-out reason banner */}
        {greyed&&(
          <div style={{background:"#f0f2f5",border:"1px solid #d0d7de",borderTop:"none",
            borderRadius:"0 0 6px 6px",padding:"5px 10px",display:"flex",gap:6,alignItems:"flex-start"}}>
            <span style={{fontSize:12,flexShrink:0}}>ℹ️</span>
            <span style={{fontSize:10,color:"#6b7a8d",lineHeight:1.5}}>{greyReason}</span>
          </div>
        )}
        {/* Warning banners */}
        {!greyed&&warnings.length>0&&(
          <div style={{background:"#fffbeb",border:"1px solid #b7791f",borderTop:"none",
            borderRadius:"0 0 6px 6px",padding:"6px 10px",display:"flex",flexDirection:"column",gap:4}}>
            {warnings.map((w,i)=>(
              <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start"}}>
                <span style={{fontSize:12,flexShrink:0}}>⚠️</span>
                <span style={{fontSize:10,color:"#7b4f12",lineHeight:1.5}}>{w}</span>
              </div>
            ))}
          </div>
        )}
        {/* CS109 — always subcontracted, prominent banner under greyed row */}
        {t==="CS109"&&greyed&&(
          <div style={{background:"#fef2f2",border:"1px solid #dc2626",borderTop:"none",
            borderRadius:"0 0 6px 6px",padding:"8px 10px",display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{fontSize:15,flexShrink:0}}>🚫</span>
            <span style={{fontSize:10,color:"#7f1d1d",lineHeight:1.6}}>
              <b>NU Labs does not perform CS109.</b> If this test is required by the specification, it must be <b>subcontracted</b>. Add a separate subcontract line item to this quote and notify the customer.
            </span>
          </div>
        )}
        {isExp&&sh&&(
          <div style={{background:"#f7f9fb",border:"1px solid "+C.border,borderTop:"none",
            borderRadius:"0 0 6px 6px",padding:"6px 10px"}}>
            {sh.bd.map(([lbl,val],i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:2}}>
                <span>{lbl}</span>
                <span style={{fontFamily:"monospace"}}>{val.toFixed(4)} shifts</span>
              </div>
            ))}
            <div style={{fontSize:10,color:C.text,fontWeight:600,borderTop:"1px solid "+C.border,marginTop:4,paddingTop:4,display:"flex",justifyContent:"space-between"}}>
              <span>Total (rounded up)</span>
              <span style={{fontFamily:"monospace"}}>{sh.rounded} shifts = {"$"}{r25(Math.round(sh.rounded*rate)).toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>;
    })}
    {selShifts>0&&(
      <div style={{fontSize:11,color:C.redDim,fontWeight:600,marginTop:6,padding:"6px 8px",background:"#fdf3f2",borderRadius:6}}>
        {"Testing: "}{selShifts}{" shifts x $"}{rate.toLocaleString()}{" = $"}{r25(Math.round(selShifts*rate)).toLocaleString()}
      </div>
    )}
    <ProcReport s={s} set={set} procPrice={3425} reportPrice={2850} sectionCode="21"/>
  </div>;
}

function PqForm({s,set,ti}){
  const autoPhase=ti?.phase||"";
  const PQ_P1=[
    {key:"5.3.1",label:"Grounding (susceptibility) test",sh:0.5,sh3p:null},
    {key:"5.3.2",label:"User equipment power profile test",sh:1.0,sh3p:null},
    {key:"5.3.3",label:"Voltage and frequency maximum departure tolerance test",sh:1.0,sh3p:null},
    {key:"5.3.4",label:"Voltage and frequency transient tolerance and recovery test",sh:1.0,sh3p:null},
    {key:"5.3.5",label:"Voltage spike (susceptibility) test",sh:1.5,sh3p:2.0},
    {key:"5.3.6",label:"Emergency conditions (susceptibility) test",sh:2.0,sh3p:null},
    {key:"5.3.7",label:"Current waveform (emission) test",sh:0.75,sh3p:1.0},
    {key:"5.3.8",label:"Voltage and frequency modulation test",sh:2.0,sh3p:null},
    {key:"5.3.9",label:"Simulated human body impedance ground current test",sh:0.75,sh3p:null},
    {key:"5.3.10.1",label:"Equipment line-to-ground voltage test",sh:0.5,sh3p:null},
    {key:"5.3.10.2",label:"Equipment line-to-ground voltage test (AGD)",sh:0.5,sh3p:null},
  ];
  const PQ_300B=[
    {key:"B5.3.1",label:"Voltage and frequency tolerance test",sh:1.0,sh3p:null},
    {key:"B5.3.2",label:"Voltage and frequency transient tolerance and recovery test",sh:1.0,sh3p:null},
    {key:"B5.3.3",label:"Voltage spike test",sh:1.5,sh3p:2.0},
    {key:"B5.3.4",label:"Emergency condition test",sh:2.0,sh3p:null},
    {key:"B5.3.5",label:"Grounding test",sh:0.5,sh3p:null},
    {key:"B5.3.6",label:"User equipment power profile test",sh:1.0,sh3p:null},
    {key:"B5.3.7",label:"Current waveform test",sh:0.75,sh3p:1.0},
    {key:"B5.3.8",label:"Voltage and frequency modulation test",sh:2.0,sh3p:null},
    {key:"B5.3.9",label:"Simulated human body leakage current test",sh:0.75,sh3p:null},
    {key:"B5.3.10.1",label:"Equipment insulation resistance test",sh:0.5,sh3p:null},
    {key:"B5.3.10.2",label:"Active ground detection test",sh:0.5,sh3p:null},
  ];
  const rate=sf(s.rate,PQ_SR);
  const is3ph=sf(s.phases||autoPhase||3,3)>=3;
  // Use phase-aware shifts
  const getShifts=r=>is3ph&&r.sh3p!=null?r.sh3p:r.sh;
  const p1Shifts=PQ_P1.reduce((a,r)=>a+(s.rows?.[r.key]?getShifts(r):0),0);
  const b3Shifts=PQ_300B.reduce((a,r)=>a+(s.rows?.[r.key]?getShifts(r):0),0);
  const totalShifts=p1Shifts+b3Shifts;
  const su=r25(sf(s.setupShifts,1.5)*rate), td=r25(sf(s.tdShifts,1.0)*rate);
  const testCost=r25(totalShifts*rate);
  const allP1=PQ_P1.every(r=>s.rows?.[r.key]);
  const allB3=PQ_300B.every(r=>s.rows?.[r.key]);
  const toggleP1=()=>{const v=!allP1;const rows={...s.rows};PQ_P1.forEach(r=>rows[r.key]=v);set({...s,rows});};
  const toggleB3=()=>{const v=!allB3;const rows={...s.rows};PQ_300B.forEach(r=>rows[r.key]=v);set({...s,rows});};

  const renderTable=(rows,title,allSel,onToggleAll)=>(
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:11,color:C.accent,fontWeight:700}}>{title}</div>
        <button onClick={onToggleAll}
          style={{background:"none",border:"1px solid "+C.border,borderRadius:5,padding:"2px 8px",
            cursor:"pointer",fontSize:10,color:allSel?C.red:C.accent,fontWeight:600}}>
          {allSel?"Deselect All":"Select All"}
        </button>
      </div>
      <div style={{border:"1px solid "+C.border,borderRadius:7,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"20px 80px 1fr 60px",
          background:C.panel,padding:"4px 8px",fontSize:9,color:C.dim,fontWeight:700,gap:6}}>
          <div/>
          <div>Section</div>
          <div>Requirement</div>
          <div style={{textAlign:"right"}}>Shifts</div>
        </div>
        {rows.map((r,i)=>{
          const checked=s.rows?.[r.key]||false;
          const sh=getShifts(r);
          return(
            <div key={r.key} style={{display:"grid",gridTemplateColumns:"20px 80px 1fr 60px",
              padding:"5px 8px",gap:6,alignItems:"center",
              background:checked?"#f0fdf4":i%2===0?C.card:C.panel,
              borderTop:"1px solid "+(checked?"#86efac":C.border)}}>
              <input type="checkbox" checked={checked}
                onChange={e=>{const rows={...s.rows};rows[r.key]=e.target.checked;set({...s,rows});}}
                style={{accentColor:"#166534",width:12,height:12}}/>
              <span style={{fontSize:10,fontWeight:600,color:checked?"#166534":C.accent}}>{r.key.replace("B","")}</span>
              <span style={{fontSize:10,color:checked?"#15803d":C.text}}>{r.label}</span>
              <span style={{fontSize:10,color:C.muted,textAlign:"right",fontFamily:"monospace"}}>
                {sh}{sh!==r.sh&&" *"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return <div>
    <Row label="Shift Rate ($)"><Inp value={s.rate} onChange={v=>set({...s,rate:v})} width={80}/></Row>
    <Row label="Phases">
      <Inp value={s.phases||autoPhase||"3"} onChange={v=>set({...s,phases:v})} width={50}/>
      {autoPhase&&!s.phases&&<span style={{fontSize:9,color:C.accent,marginLeft:4}}>auto from TI</span>}
      {is3ph&&<span style={{fontSize:10,color:C.warn,marginLeft:6}}>3-phase: shifts adjusted</span>}
    </Row>
    <Row label="Setup Shifts"><Inp value={s.setupShifts} onChange={v=>set({...s,setupShifts:v})} width={60}/></Row>
    <Row label="Teardown Shifts"><Inp value={s.tdShifts} onChange={v=>set({...s,tdShifts:v})} width={60}/></Row>
    <Pia s={s} set={set}/>
    <Toggle small checked={s.cw||false} onChange={v=>set({...s,cw:v})} label="Current Waveform (facility power)"/>
    {sf(s.rate,PQ_SR)>=440&&(
      <div style={{fontSize:11,color:C.warn,marginBottom:4}}>⚠ 440 VAC — source rental required.</div>
    )}
    {(()=>{
      const eutAmps=sf(ti?.amps||'0',0);
      const numPhases=sf(s.phases||autoPhase||'3',3);
      const isSubPQ=s.submarine||false;
      const agdSelected=(s.rows||{})['5.3.10.2']||(s.rows||{})['B5.3.10.2'];
      const cwSelected=(s.rows||{})['5.3.7']||(s.rows||{})['B5.3.7'];
      const spikeSelected=(s.rows||{})['5.3.5']||(s.rows||{})['B5.3.3'];
      const pqWarnings=[];
      if(eutAmps>0&&eutAmps<1&&cwSelected)
        pqWarnings.push('Current Waveform test (5.3.7 / B5.3.7) is not required for EUT currents <1 A per NAVSEA. Consider removing this test.');
      if(agdSelected)
        pqWarnings.push('AGD test (5.3.10.2 / B5.3.10.2): If required (common for submarines), a high-voltage power supply rental will likely be needed.');
      if(numPhases>3||sf(ti?.phase||'3',3)>3)
        pqWarnings.push('Unit has multiple power feeds — discuss with customer which lines require testing and which tests apply to each feed before finalizing scope.');
      if(spikeSelected)
        pqWarnings.push('Voltage Spike testing: NU Labs uses an IEC 61000-4-5 waveform instead of the MIL-STD waveform, as noted in the Test Specifications.');
      if(pqWarnings.length===0)return null;
      return(
        <div style={{background:"#fffbeb",border:"1px solid #b7791f",borderRadius:7,padding:"8px 10px",marginTop:6,marginBottom:4}}>
          {pqWarnings.map((w,i)=>(
            <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:i<pqWarnings.length-1?5:0}}>
              <span style={{fontSize:12,flexShrink:0}}>⚠️</span>
              <span style={{fontSize:10,color:"#7b4f12",lineHeight:1.5}}>{w}</span>
            </div>
          ))}
        </div>
      );
    })()}
    <HR/>
    {renderTable(PQ_P1,"MIL-STD-1399 Section 300 Part 1",allP1,toggleP1)}
    {renderTable(PQ_300B,"MIL-STD-1399 Section 300B",allB3,toggleB3)}
    <HR/>
    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>
      {"Setup: "}{money(su)}{"  ·  Testing: "}{money(testCost)}{" ("}{totalShifts}{" shifts)  ·  TD: "}{money(td)}
    </div>
    <div style={{fontSize:12,color:C.redDim,fontWeight:600,marginBottom:4}}>
      {"PQ Total: "}{money(su+testCost+td)}
    </div>
    <ProcReport s={s} set={set} procPrice={2925} reportPrice={2450} sectionCode="22"/>
  </div>;
}

function DcmForm({s,set}){
  const rate=sf(s.rate,DCM_SR);
  const total=(sf(s.setupShifts,1.5)+sf(s.testShifts,1.0))*rate;
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <Row label="Shift Rate ($)"><Inp value={s.rate} onChange={v=>set({...s,rate:v})} width={80}/></Row>
    <Row label="Setup Shifts"><Inp value={s.setupShifts} onChange={v=>set({...s,setupShifts:v})} width={60}/></Row>
    <Row label="Testing Shifts"><Inp value={s.testShifts} onChange={v=>set({...s,testShifts:v})} width={60}/></Row>
    <HR/>
    <div style={{fontSize:12,color:C.redDim,fontWeight:600}}>
      {"DCM Total: "}{money(total)}
    </div>
    <Pia s={s} set={set}/>
    <ProcReport s={s} set={set} procPrice={1950} reportPrice={1500} sectionCode="23"/>
  </div>;
}

function HfvForm({s,set,setup}){
  const pm=s.pia||1;
  const fab=setup?Math.round(sf(setup.fabHours)*sf(setup.techRate,175)):0;
  const std=sf(s.stdSetup||s.setup||500);
  const addl=sf(s.addlCosts,0);
  const setupTotal=std+fab+addl;
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <Row label="Duration/Axis (min)"><Inp value={s.dur} onChange={v=>set({...s,dur:v})} width={60}/></Row>
    <Pia s={s} set={set}/>
    <HR/>
    <PRow label="Std Setup" val={s.stdSetup||s.setup||"500"} onChange={v=>set({...s,stdSetup:v})}/>
    <PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>
    <PRow label="Testing" val={s.testing} onChange={v=>set({...s,testing:v})}/>
    <div style={{fontSize:10,background:C.panel,borderRadius:5,padding:"5px 8px",marginBottom:6}}>
      <span style={{color:C.dim}}>Setup: </span>
      <span style={{color:C.text,fontWeight:600}}>{money(setupTotal)}</span>
      <span style={{color:C.dim,fontSize:9}}>{" = $"+std.toLocaleString()+(fab>0?" + $"+fab.toLocaleString()+" fab":""+(addl>0?" + $"+addl.toLocaleString()+" addl":""))+(pm>1?" x "+pm+" PIA":"")}</span>
    </div>
    <ProcReport s={s} set={set} sectionCode="52"/>
  </div>;
}

function ShoForm({s,set,setup}){
  const pm=s.pia||1;
  const fab=setup?Math.round(sf(setup.fabHours)*sf(setup.techRate,175)):0;
  const std=sf(s.stdSetup||s.setup||500);
  const addl=sf(s.addlCosts,0);
  const hfvOn=false; // HFV discount handled in calcSummary
  const setupTotal=std+fab+addl;
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <Row label="Pulse Shape">
      <Sel value={s.shape} onChange={v=>set({...s,shape:v})}
        options={["Half Sine","Sawtooth","Bench Handling","Drop Shock"]} width={160}/>
    </Row>
    <Row label="G Level"><Inp value={s.gLevel||""} onChange={v=>set({...s,gLevel:v})} width={70}/></Row>
    <Row label="Pulse Duration (ms)"><Inp value={s.pDur||""} onChange={v=>set({...s,pDur:v})} width={70}/></Row>
    <Row label="# Pulses"><Inp value={s.nPulses||""} onChange={v=>set({...s,nPulses:v})} width={60}/></Row>
    <Pia s={s} set={set}/>
    <HR/>
    <PRow label="Std Setup" val={s.stdSetup||s.setup||"500"} onChange={v=>set({...s,stdSetup:v})}/>
    <PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>
    <PRow label="Testing" val={s.testing} onChange={v=>set({...s,testing:v})}/>
    <div style={{fontSize:10,background:C.panel,borderRadius:5,padding:"5px 8px",marginBottom:6}}>
      <span style={{color:C.dim}}>Setup: </span>
      <span style={{color:C.text,fontWeight:600}}>{money(setupTotal)}</span>
      <span style={{color:C.dim,fontSize:9}}>{" = $"+std.toLocaleString()+(fab>0?" + $"+fab.toLocaleString()+" fab":"")+(addl>0?" + $"+addl.toLocaleString()+" addl":"")+(pm>1?" x "+pm+" PIA":"")}</span>
      {fab===0&&<span style={{color:C.dim,fontSize:9}}>{" (25% disc if HFV active)"}</span>}
    </div>
    <ProcReport s={s} set={set} sectionCode="51"/>
  </div>;
}

function InstForm({s,set}){
  const ITEMS=[
    {key:"shock",label:"Shock Instrumentation",price:525,ch:true},
    {key:"cmShock",label:"Contact Monitoring (Shock)",price:350,ch:true},
    {key:"vib",label:"Vib Addl Channels",price:700,ch:true},
    {key:"cmVib",label:"Contact Monitoring (Vibe)",price:750,ch:true},
    {key:"hsv",label:"High Speed Video",price:1950,ch:false},
  ];
  return <div>
    {ITEMS.map(item=>{
      const on=s.items?.[item.key]?.on||false;
      const channels=s.items?.[item.key]?.channels||"1";
      return(
        <div key={item.key} style={{background:on?"#fdf3f2":C.panel,
          border:"1px solid "+(on?C.red+"44":C.border),borderRadius:7,padding:"8px 10px",marginBottom:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Toggle small checked={on}
              onChange={v=>set({...s,items:{...s.items,[item.key]:{...s.items?.[item.key],on:v,channels}}})}
              label={item.label+" — "+money(item.price)+(item.ch?"/ch":"")}/>
            {on&&item.ch&&(
              <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:11,color:C.muted}}>Ch:</span>
                <Inp value={channels}
                  onChange={v=>set({...s,items:{...s.items,[item.key]:{...s.items?.[item.key],channels:v}}})}
                  width={45}/>
              </div>
            )}
          </div>
        </div>
      );
    })}
  </div>;
}

function OtForm({s,set}){
  const PCODE_OPTS=[
    {code:"94",label:"Vibration"},
    {code:"91",label:"Medium Weight Shock"},
    {code:"92",label:"Lightweight Shock"},
    {code:"11",label:"Noise Susceptibility"},
    {code:"51",label:"EMI Testing"},
    {code:"52",label:"HFV / Shock Other"},
    {code:"53",label:"Temp & Humidity"},
    {code:"54",label:"ESS"},
    {code:"55",label:"Salt Fog"},
    {code:"56",label:"Altitude / Decomp"},
    {code:"57",label:"Acceleration"},
    {code:"58",label:"Drip / Sub / Spray"},
    {code:"12",label:"Airborne / Structureborne"},
    {code:"95",label:"Hydrostatic"},
    {code:"96",label:"Tear Down"},
    {code:"33",label:"Instrumentation"},
    {code:"41",label:"CoC / Test Report"},
    {code:"42",label:"Test Procedure"},
    {code:"43",label:"EMI/DCM/PQ Report"},
    {code:"44",label:"EMI/DCM/PQ Procedure"},
    {code:"98",label:"Subcontract"},
  ];
  // Weekday: $300 min call + $262.50/tech/hr | Weekend: $825 min call + $350/tech/hr
  const calcOT=(r)=>{
    const techs=sf(r.techs,1), hrs=sf(r.hours,0);
    const isWknd=r.type==="Weekend";
    const min=isWknd?825:300;
    const rate=isWknd?350:262.5;
    return min+techs*hrs*rate;
  };
  const add=()=>set({...s,rows:[...s.rows,{label:"",type:"Weekday",techs:"1",hours:"0",pcode:"94"}]});
  const rem=i=>set({...s,rows:s.rows.filter((_,j)=>j!==i)});
  const upd=(i,k,v)=>set({...s,rows:s.rows.map((r,j)=>j===i?{...r,[k]:v}:r)});
  return <div>
    {s.rows.map((r,i)=>{
      const total=calcOT(r);
      const techs=sf(r.techs,1), hrs=sf(r.hours,0);
      const isWknd=r.type==="Weekend";
      const min=isWknd?825:300;
      const rate=isWknd?350:262.5;
      const pcodeLabel=PCODE_OPTS.find(p=>p.code===r.pcode);
      return(
      <div key={i} style={{background:C.panel,border:"1px solid "+C.border,borderRadius:7,padding:"8px 10px",marginBottom:6}}>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:5}}>
          <Inp value={r.label} onChange={v=>upd(i,"label",v)} width={140} placeholder="Description"/>
          <Sel value={r.type} onChange={v=>upd(i,"type",v)} options={["Weekday","Weekend"]} width={95}/>
          <span style={{fontSize:11,color:C.muted}}>Techs:</span>
          <Inp value={r.techs} onChange={v=>upd(i,"techs",v)} width={40}/>
          <span style={{fontSize:11,color:C.muted}}>Hrs:</span>
          <Inp value={r.hours} onChange={v=>upd(i,"hours",v)} width={40}/>
          <button onClick={()=>rem(i)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,padding:"0 4px"}}>✕</button>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
          <span style={{fontSize:9,color:C.dim}}>Product Code:</span>
          <select value={r.pcode||"94"} onChange={e=>upd(i,"pcode",e.target.value)}
            style={{...sel,fontSize:10,padding:"2px 6px"}}>
            {PCODE_OPTS.map(p=><option key={p.code} value={p.code}>{p.code} – {p.label}</option>)}
          </select>
        </div>
        <div style={{fontSize:10,color:C.accent,background:"#eef4fb",borderRadius:5,padding:"3px 8px"}}>
          <span style={{fontWeight:600}}>{money(total)}</span>
          <span style={{color:C.dim}}>{" = $"+min.toLocaleString()+" min call + "+techs+"x"+hrs+"hrsx$"+rate+"/hr"+(isWknd?" (weekend)":"")}</span>
        </div>
      </div>
      );
    })}
    <button onClick={add}
      style={{background:"none",border:"1px dashed "+C.border,borderRadius:7,
        color:C.muted,padding:"7px 14px",cursor:"pointer",fontSize:12,width:"100%"}}>
      + Add Overtime Row
    </button>
  </div>;
}

function CustomForm({s,set}){
  const PCODE_OPTS=[
    {code:"94",label:"Vibration"},{code:"91",label:"MW Shock"},{code:"92",label:"LW Shock"},
    {code:"11",label:"Noise"},{code:"51",label:"EMI"},{code:"52",label:"HFV/Shock Other"},
    {code:"53",label:"T&H"},{code:"54",label:"ESS"},{code:"55",label:"Salt Fog"},
    {code:"56",label:"Altitude"},{code:"57",label:"Acceleration"},{code:"58",label:"Drip/Sub/Spray"},
    {code:"12",label:"AB/SB Noise"},{code:"95",label:"Hydrostatic"},{code:"96",label:"Tear Down"},
    {code:"33",label:"Instrumentation"},{code:"41",label:"Report/CoC"},{code:"42",label:"Procedure"},
    {code:"43",label:"EMI/PQ/DCM Report"},{code:"44",label:"EMI/PQ/DCM Proc"},{code:"98",label:"Subcontract"},
  ];
  const add=()=>set({...s,rows:[...s.rows,{label:"Custom Item",price:"0",pcode:"94"}]});
  const rem=i=>set({...s,rows:s.rows.filter((_,j)=>j!==i)});
  const upd=(i,k,v)=>set({...s,rows:s.rows.map((r,j)=>j===i?{...r,[k]:v}:r)});
  return <div>
    {s.rows.map((r,i)=>(
      <div key={i} style={{background:C.panel,borderRadius:7,padding:"7px 10px",marginBottom:6}}>
        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
          <select value={r.pcode||"94"} onChange={e=>upd(i,"pcode",e.target.value)}
            style={{...sel,fontSize:10,padding:"2px 5px",width:160}}>
            {PCODE_OPTS.map(p=><option key={p.code} value={p.code}>{p.code} – {p.label}</option>)}
          </select>
          <Inp value={r.label} onChange={v=>upd(i,"label",v)} width={170}/>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:11,color:C.muted}}>$</span>
          <Inp value={r.price} onChange={v=>upd(i,"price",v)} width={90} right/>
          <button onClick={()=>rem(i)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>✕</button>
        </div>
      </div>
    ))}
    <button onClick={add}
      style={{background:"none",border:"1px dashed "+C.border,borderRadius:7,
        color:C.muted,padding:"7px 14px",cursor:"pointer",fontSize:12,width:"100%"}}>
      + Add Custom Line Item
    </button>
  </div>;
}

function AbForm({s,set,setup}){
  const dr=setup?Math.round(sf(setup.holes)*0.5*sf(setup.techRate,175)*(setup.drillTap?1.5:1)):0;
  const fab=setup?Math.round(sf(setup.fabHours)*sf(setup.techRate,175)):0;
  const std=sf(s.stdSetup||s.setup||1000);
  const addl=sf(s.addlCosts,0);
  const setupTotal=std+dr+fab+addl;
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <HR/>
    <PRow label="Std Setup" val={s.stdSetup||s.setup||"1000"} onChange={v=>set({...s,stdSetup:v})}/>
    <PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>
    <PRow label="Testing" val={s.testing} onChange={v=>set({...s,testing:v})}/>
    <div style={{fontSize:10,background:C.panel,borderRadius:5,padding:"5px 8px",marginBottom:6}}>
      <span style={{color:C.dim}}>Setup: </span>
      <span style={{color:C.text,fontWeight:600}}>{money(setupTotal)}</span>
      <span style={{color:C.dim,fontSize:9}}>{" = $"+std.toLocaleString()+(dr>0?" + $"+dr.toLocaleString()+" drill":"")+(fab>0?" + $"+fab.toLocaleString()+" fab":"")+(addl>0?" + $"+addl.toLocaleString()+" addl":"")}</span>
    </div>
    <ProcReport s={s} set={set} sectionCode="12"/>
  </div>;
}

function SbForm({s,set,setup}){
  const dr=setup?Math.round(sf(setup.holes)*0.5*sf(setup.techRate,175)*(setup.drillTap?1.5:1)):0;
  const fab=setup?Math.round(sf(setup.fabHours)*sf(setup.techRate,175)):0;
  const std=sf(s.stdSetup||s.setup||850);
  const addl=sf(s.addlCosts,0);
  const setupTotal=std+dr+fab+addl;
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <HR/>
    <PRow label="Std Setup" val={s.stdSetup||s.setup||"850"} onChange={v=>set({...s,stdSetup:v})}/>
    <PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>
    <PRow label="Testing" val={s.testing} onChange={v=>set({...s,testing:v})}/>
    <div style={{fontSize:10,background:C.panel,borderRadius:5,padding:"5px 8px",marginBottom:6}}>
      <span style={{color:C.dim}}>Setup: </span>
      <span style={{color:C.text,fontWeight:600}}>{money(setupTotal)}</span>
      <span style={{color:C.dim,fontSize:9}}>{" = $"+std.toLocaleString()+(dr>0?" + $"+dr.toLocaleString()+" drill":"")+(fab>0?" + $"+fab.toLocaleString()+" fab":"")+(addl>0?" + $"+addl.toLocaleString()+" addl":"")}</span>
    </div>
    <ProcReport s={s} set={set} sectionCode="12"/>
  </div>;
}

function BudgetSection({budget,setBudget,setupLines}){
  const add=()=>setBudget({...budget,rows:[...budget.rows,{desc:"",qty:"1",unitCost:"0",rollInto:"SEPARATE"}]});
  const rem=i=>setBudget({...budget,rows:budget.rows.filter((_,j)=>j!==i)});
  const upd=(i,k,v)=>setBudget({...budget,rows:budget.rows.map((r,j)=>j===i?{...r,[k]:v}:r)});
  const mp=sf(budget.markup,25)/100;
  const total=budget.rows.reduce((s,r)=>s+sf(r.qty,1)*sf(r.unitCost,0),0);
  const rollOpts=["SEPARATE",...(setupLines||[])];

  if(!budget.on) return(
    <div style={{marginBottom:10}}>
      <Toggle small checked={false} onChange={v=>setBudget({...budget,on:v})} label="Budget Materials"/>
    </div>
  );
  return(
    <div style={{...card}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <Toggle small checked={budget.on} onChange={v=>setBudget({...budget,on:v})} label="BUDGET MATERIALS"/>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,color:C.muted}}>Markup %</span>
          <Inp value={budget.markup} onChange={v=>setBudget({...budget,markup:v})} width={50} right/>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 55px 75px 75px 120px 22px",gap:4,marginBottom:4}}>
        {["Description","Qty","Unit Cost","Marked Up","Roll Into",""].map((h,i)=>(
          <div key={i} style={{fontSize:9,color:C.dim,padding:"0 4px"}}>{h}</div>
        ))}
      </div>
      {budget.rows.map((r,i)=>(
        <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 55px 75px 75px 120px 22px",gap:4,marginBottom:4,alignItems:"center"}}>
          <Inp value={r.desc} onChange={v=>upd(i,"desc",v)} width="100%"/>
          <Inp value={r.qty} onChange={v=>upd(i,"qty",v)} width={55} right/>
          <Inp value={r.unitCost} onChange={v=>upd(i,"unitCost",v)} width={75} right/>
          <div style={{fontSize:11,color:C.muted,textAlign:"right",paddingRight:4}}>
            {"$"}{Math.round(sf(r.qty,1)*sf(r.unitCost,0)*(1+mp)).toLocaleString()}
          </div>
          <select value={r.rollInto||"SEPARATE"} onChange={e=>upd(i,"rollInto",e.target.value)}
            style={{...sel,fontSize:10,padding:"3px 4px",width:"100%"}}>
            {rollOpts.map(o=>(
              <option key={o} value={o}>{o==="SEPARATE"?"— Separate line —":o}</option>
            ))}
          </select>
          <button onClick={()=>rem(i)}
            style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0}}>✕</button>
        </div>
      ))}
      <button onClick={add}
        style={{background:"none",border:"1px dashed "+C.border,borderRadius:7,
          color:C.muted,padding:"5px 12px",cursor:"pointer",fontSize:11,width:"100%",marginTop:4}}>
        + Add Item
      </button>
      {total>0&&(
        <div style={{marginTop:8,fontSize:12,color:C.redDim,fontWeight:600,textAlign:"right"}}>
          {"Hard: $"}{Math.round(total).toLocaleString()}{" · Marked up: $"}{Math.round(total*(1+mp)).toLocaleString()}
        </div>
      )}
      {/* Internal notes — budget PDF only */}
      <div style={{marginTop:12,borderTop:"1px solid "+C.border,paddingTop:10}}>
        <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:3}}>INTERNAL NOTES</div>
        <div style={{fontSize:9,color:C.dim,marginBottom:4}}>For internal use only. Appears on budget PDF, not the quote.</div>
        <textarea
          value={budget.notes||""}
          onChange={e=>setBudget({...budget,notes:e.target.value})}
          placeholder="Add internal notes for this budget (vendor info, lead times, sourcing, etc.)..."
          rows={3}
          style={{...inp,width:"100%",resize:"vertical",fontSize:11,lineHeight:1.6}}/>
      </div>
    </div>
  );
}

// ── Quote Search panel ─────────────────────────────────────────────────────────
const STORAGE_KEY="vibrato_quotes";

function saveQuote(quotes,quote){
  const id=quote.id||Date.now();
  const updated={...quotes,[id]:{...quote,id,savedAt:new Date().toISOString()}};
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(updated));}catch(e){}
  return updated;
}
function loadQuotes(){
  try{const d=localStorage.getItem(STORAGE_KEY);return d?JSON.parse(d):{};}
  catch(e){return {};}
}
function deleteQuote(quotes,id){
  const updated={...quotes};
  delete updated[id];
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(updated));}catch(e){}
  return updated;
}

function QuoteSearch({onLoad}){
  const [search,setSearch]=useState("");
  const [quotes,setQuotes]=useState({});
  const [open,setOpen]=useState(false);
  const ref=useRef(null);

  useEffect(()=>{setQuotes(loadQuotes());},[open]);

  // Close on outside click
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  const filtered=Object.values(quotes).filter(q=>{
    if(!search.trim())return true;
    const s=search.toLowerCase();
    return(q.opp||"").toLowerCase().includes(s)||(q.customer||"").toLowerCase().includes(s)||(q.rfq||"").toLowerCase().includes(s);
  }).sort((a,b)=>new Date(b.savedAt||0)-new Date(a.savedAt||0));

  return(
    <div ref={ref} style={{position:"relative"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,background:C.card,
        border:"1px solid "+C.border,borderRadius:7,padding:"5px 10px",cursor:"text"}}
        onClick={()=>setOpen(true)}>
        <span style={{fontSize:14,color:C.muted}}>🔍</span>
        <input value={search} onChange={e=>{setSearch(e.target.value);setOpen(true);}}
          placeholder="Search saved quotes…"
          style={{border:"none",outline:"none",background:"transparent",color:C.text,fontSize:12,width:180}}/>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,width:340,
          background:C.card,border:"1px solid "+C.border,borderRadius:10,
          boxShadow:"0 4px 20px rgba(0,0,0,0.15)",zIndex:1000,maxHeight:380,overflow:"hidden",
          display:"flex",flexDirection:"column"}}>
          <div style={{padding:"8px 12px",borderBottom:"1px solid "+C.border,
            fontSize:11,color:C.muted,fontWeight:600}}>
            {filtered.length} quote{filtered.length!==1?"s":""} found
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            {filtered.length===0&&(
              <div style={{padding:20,textAlign:"center",color:C.dim,fontSize:12}}>
                No quotes found
              </div>
            )}
            {filtered.map(q=>(
              <div key={q.id}
                onClick={()=>{onLoad(q);setOpen(false);setSearch("");}}
                style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid "+C.border,
                  transition:"background .1s"}}
                onMouseEnter={e=>e.currentTarget.style.background=C.panel}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{fontWeight:600,fontSize:13,color:C.text,marginBottom:2}}>
                  {q.opp||"Untitled Quote"}
                </div>
                <div style={{fontSize:11,color:C.muted}}>
                  {[q.customer,q.rfq&&"RFQ: "+q.rfq].filter(Boolean).join(" · ")}
                </div>
                <div style={{fontSize:10,color:C.dim,marginTop:2}}>
                  {q.savedAt?new Date(q.savedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"}):""}
                  {q.total?" · "+money(q.total):""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Initial state factories ───────────────────────────────────────────────────
const newAb=()=>({id:Date.now(),on:false,spec:"",rev:"1474",testing:"2850",stdSetup:"1000",addlCosts:"0",proc:false,report:false});
const newSb=()=>({id:Date.now(),on:false,spec:"",rev:"167 Type II",testing:"2650",stdSetup:"850",addlCosts:"0",proc:false,report:false});
const newVib=()=>({id:Date.now(),on:false,cat:"LAB Vibration (MIL-STD-167)",spec:"",freqRange:"",circ:false,hydroPre:false,hydroPost:false,hydroPrice:"500",pia:0,testing:"3250",stdSetup:"1250",addlCosts:"0",proc:false,report:false});
const newShock=()=>({id:Date.now(),on:false,cat:"Medium Weight",spec:"",grade:"A",class_:"I",type_:"A",location:"Hull",submarine:false,orientation:"Unrestricted",blows:"",fromVib:false,hydroPre:false,hydroPost:false,hydroPrice:"500",pia:0,testing:"4575",stdSetup:"1500",addlCosts:"0",proc:false,report:false});
const newNoise=()=>({id:Date.now(),on:false,spec:"",level:"<=140dB",oaspl:"",chamber:"Speakerbox",durVal:"30",durUnit:"minutes",compBudget:"0",pia:0,testing:"3950",stdSetup:"1000",addlCosts:"0",proc:false,report:false});
const newEnv=()=>({id:Date.now(),on:false,spec:"",items:{},thDur:"0 to 1 Day",thType:"Temperature & Humidity",proc:false,report:false});
const newEmi=()=>({id:Date.now(),on:false,spec:"",rate:"1600",addl:"0",setupShifts:"3.0",tdShifts:"1.0",dimL:"",dimW:"",dimH:"",weight:"",cables:"0",rs103amp:"",plats:{},locs:{},revs:{},pia:0,tests:{},proc:false,report:false});
const newPq=()=>({id:Date.now(),on:false,rate:"1450",setupShifts:"1.5",tdShifts:"1.0",rows:{},pia:0,cw:false,proc:false,report:false});
const newDcm=()=>({id:Date.now(),on:false,spec:"",rate:"1600",setupShifts:"1.5",testShifts:"3.0",pia:0,proc:false,report:false});
const newHfv=()=>({id:Date.now(),on:false,spec:"",dur:"30",pia:0,testing:"1000",stdSetup:"500",addlCosts:"0",proc:false,report:false});
const newSho=()=>({id:Date.now(),on:false,spec:"",shape:"Half Sine",pia:0,testing:"1250",stdSetup:"500",addlCosts:"0",proc:false,report:false});

// ── Summary calculation helper ────────────────────────────────────────────────
// Compute a section's total setup = stdSetup + global drilling + global fab + addlCosts
function sectionSetup(s, globalSetup){
  const std   = sf(s.stdSetup, sf(s.setup, 0));  // fallback to old 'setup' field for loaded quotes
  const drill = sf(globalSetup.holes) * 0.5 * sf(globalSetup.techRate, 175) * (globalSetup.drillTap ? 1.5 : 1);
  const fab   = sf(globalSetup.fabHours) * sf(globalSetup.techRate, 175);
  const addl  = sf(s.addlCosts, 0);
  return Math.round(std + drill + fab + addl);
}

function pcode(label){
  const dl=label.toLowerCase();
  if(dl.includes("procedure")||dl.includes("proc"))return dl.includes("emi")||dl.includes("dcm")||dl.includes("dc mag")||dl.includes("pq")||dl.includes("power quality")?"44":"42";
  if(dl.includes("report"))return dl.includes("emi")||dl.includes("dcm")||dl.includes("dc mag")||dl.includes("pq")||dl.includes("power quality")?"43":"41";
  if(dl.includes("certificate"))return "41";
  if(dl.includes("tear down")||dl.includes("teardown"))return "96";
  if(dl.includes("hydrostatic"))return "95";
  if(dl.includes("circulating"))return "94";
  if(dl.includes("high frequency vib")||dl.includes("hfv"))return "52";
  if(dl.includes("shock (other)"))return "52";
  if(dl.includes("airborne")||dl.includes("structureborne"))return "12";
  if(dl.includes("noise"))return "11";
  if(dl.includes("emi")||dl.includes("dc magnet")||dl.includes("power quality")||dl.includes(" pq ")||dl.startsWith("pq ")||dl.includes(" dcm ")||dl.startsWith("dcm "))return "51";
  if(dl.includes("humidity")||dl.includes("temperature")||dl.includes("t&h"))return "53";
  if(dl.includes("ess")||dl.includes("environmental stress"))return "54";
  if(dl.includes("salt fog"))return "55";
  if(dl.includes("altitude")||dl.includes("rapid decomp")||dl.includes("explosive decomp"))return "56";
  if(dl.includes("acceleration"))return "57";
  if(dl.includes("drip")||dl.includes("submerg")||dl.includes("spray"))return "58";
  if(dl.includes("inclination"))return "93";
  if(dl.includes("medium weight")||(dl.includes("shock")&&dl.includes("medium")))return "91";
  if(dl.includes("lightweight")||(dl.includes("shock")&&dl.includes("light")))return "92";
  if(dl.includes("shock"))return "91";
  if(dl.includes("high speed video")||dl.includes("hsv"))return "32";
  if(dl.includes("instrument")||dl.includes("channel")||dl.includes("contact monitor"))return "33";
  if(dl.includes("vibration"))return "94";
  if(dl.includes("overtime"))return "";
  return "";
}

function calcSummary(vibs,shocks,noises,envs,hfvs,shos,emis,pqs,dcms,abs,sbs,inst,ot,custom,td,coc,sub,globalPR,budget,globalSetup,splitProcReport){
  const lines=[];
  let currentUnit=0;
  let seq=0;
  const add=(label,val,_bucket,code)=>{const v=r25(sf(val));if(v>0)lines.push({label,val:v,code:code||pcode(label),unit:currentUnit,seq:seq++});};

  // Vibration instances
  vibs.filter(s=>s.on).forEach((s,idx)=>{
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const pm=s.pia||1;
    if(s.hydroPre)add("Vib"+pre+" – Pre-Test Hydrostatic",sf(s.hydroPrice||500),null,"95");
    if(s.circ)add("Circulating System",2500,null,"94");
    add("Vibration"+pre+" – Setup",sectionSetup(s,globalSetup)*pm,null,"94");
    // Vib instrumentation: between setup and testing
    if(inst.on){
      if(inst.items?.vib?.on)add("Vib Instrumentation",700*sf(inst.items.vib.channels,1),null,"33");
      if(inst.items?.cmVib?.on)add("Contact Monitoring (Vibe)",750*sf(inst.items.cmVib.channels,1),null,"33");
    }
    add("Vibration"+pre+" – Testing",sf(s.testing)*pm,null,"94");
    if(s.hydroPost)add("Vib"+pre+" – Post-Test Hydrostatic",sf(s.hydroPrice||500),null,"95");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // Shock instances (from-vib discount uses first active vib setup)
  const firstVibSetup=vibs.find(v=>v.on)?sectionSetup(vibs.find(v=>v.on),globalSetup):0;
  shocks.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const pm=s.pia||1;
    const isMW=s.cat==="Medium Weight";
    const code=isMW?"91":"92";
    let su=sectionSetup(s,globalSetup);
    if(s.fromVib&&firstVibSetup>0)su=isMW?mwDisc(firstVibSetup):lwDisc(firstVibSetup);
    if(s.hydroPre)add("Shock"+pre+" – Pre-Test Hydrostatic",sf(s.hydroPrice||500),null,"95");
    const shockSetupLabel="Shock"+pre+" – Setup"+(s.fromVib&&firstVibSetup>0?" (disc.)":"");
    const shockSetupDesc=s.fromVib&&firstVibSetup>0?"Pricing assumes the unit is coming directly from vibration testing.":null;
    {const v=Math.round(sf(su*pm));if(v>0){const u=currentUnit;const sq=seq++;lines.push({label:shockSetupLabel,val:v,code:code,desc:shockSetupDesc,unit:u,seq:sq});}}
    // Shock instrumentation + HSV: between setup and testing
    if(inst.on){
      if(inst.items?.shock?.on)add("Shock Instrumentation",525*sf(inst.items.shock.channels,1),null,"33");
      if(inst.items?.cmShock?.on)add("Contact Monitoring (Shock)",350*sf(inst.items.cmShock.channels,1),null,"33");
      if(inst.items?.hsv?.on)add("High Speed Video",1950,null,"32");
    }
    add("Shock"+pre+" – Testing",sf(s.testing)*pm,null,code);
    if(s.hydroPost)add("Shock"+pre+" – Post-Test Hydrostatic",sf(s.hydroPrice||500),null,"95");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // Noise instances
  noises.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const pm=s.pia||1;
    const noiseSetup=sectionSetup(s,globalSetup)||sf(NOISE_FAC[s.chamber],1000);
    add("Noise"+pre+" – Setup",noiseSetup*pm,null,"11");
    add("Noise"+pre+" – Testing",sf(s.testing)*pm,null,"11");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // ENV instances
  envs.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    // Use T&H type in label
    const thTypeLabel={"Temperature & Humidity":"Temp & Humidity","Temperature Only":"Temperature","Humidity Only":"Humidity"};
    const LBL={th:thTypeLabel[s.thType]||"T&H",sf:"Salt Fog",alt:"Altitude",ess:"ESS",acc:"Acceleration",incl:"Inclination",rd:"Rapid Decomp.",ed:"Explosive Decomp.",drip:"Drip Test",sub:"Submergence",spray:"Spray Test"};
    const ENV_CODE={th:"53",sf:"55",alt:"56",ess:"54",acc:"57",incl:"93",rd:"56",ed:"56",drip:"58",sub:"58",spray:"58"};
    Object.entries(s.items||{}).forEach(([k,v])=>{
      if(!v?.on)return;
      const lbl=(LBL[k]||k)+pre;
      const code=ENV_CODE[k]||"";
      const testing=k==="th"?(ENV_TH_PRICES[s.thDur]||sf(v.testing,1000)):sf(v.testing);
      const setupAmt=sf(v.setup,0);
      if(setupAmt>0)add(lbl+" – Setup",setupAmt,null,code);
      if(testing>0)add(lbl+" – Testing",testing,null,code);
    });
  });

  // HFV instances
  hfvs.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const pm=s.pia||1;
    add("HFV"+pre+" – Setup",sectionSetup(s,globalSetup)*pm,null,"52");
    add("HFV"+pre+" – Testing",sf(s.testing)*pm,null,"52");
  });

  // SHO instances
  const hfvOn=hfvs.some(s=>s.on);
  shos.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const pm=s.pia||1;
    const baseSetup=sectionSetup(s,globalSetup); const shoSetup=hfvOn?Math.ceil(baseSetup*0.75/25)*25:baseSetup;
    add("Shock (Other)"+pre+" – Setup"+(hfvOn?" (HFV disc.)":""),shoSetup*pm,null,"52");
    add("Shock (Other)"+pre+" – Testing",sf(s.testing)*pm,null,"52");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // EMI instances
  emis.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const r=sf(s.rate,EMI_SR),pm=s.pia||1;
    // Use auto-calculated shifts from unit details
    // Use ti dims as fallback if emi instance has no manual dims set
    const emiForCalc={...s,dimL:s.dimL||"0",dimW:s.dimW||"0",dimH:s.dimH||"0"};
    const emiShifts=calcEmiShifts(emiForCalc);
    const selectedTests=Object.entries(s.tests||{}).filter(([,v])=>v).map(([k])=>k);
    const testShifts=selectedTests.reduce((a,t)=>a+(emiShifts[t]?.rounded||0),0);
    const rs103AmpCost=selectedTests.includes("RS103")?sf(s.rs103amp,5000):0;
    add("EMI"+pre+" – Setup",sf(s.setupShifts,3)*r*pm,null,"51");
    if(testShifts>0)add("EMI"+pre+" – Testing",(testShifts*r+rs103AmpCost)*pm,null,"51");
    add("EMI"+pre+" – Teardown",sf(s.tdShifts,1)*r,null,"51");
    if(sf(s.addl)>0)add("EMI"+pre+" – Addl Costs",s.addl,null,"51");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // PQ instances
  pqs.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const r=sf(s.rate,PQ_SR),pm=s.pia||1;
    const is3ph=sf(s.phases||3,3)>=3;
    const PQ_ALL_SH={"5.3.1":0.5,"5.3.2":1.0,"5.3.3":1.0,"5.3.4":1.0,"5.3.5":is3ph?2.0:1.5,"5.3.6":2.0,"5.3.7":is3ph?1.0:0.75,"5.3.8":2.0,"5.3.9":0.75,"5.3.10.1":0.5,"5.3.10.2":0.5,
      "B5.3.1":1.0,"B5.3.2":1.0,"B5.3.3":is3ph?2.0:1.5,"B5.3.4":2.0,"B5.3.5":0.5,"B5.3.6":1.0,"B5.3.7":is3ph?1.0:0.75,"B5.3.8":2.0,"B5.3.9":0.75,"B5.3.10.1":0.5,"B5.3.10.2":0.5};
    const ts=Object.entries(s.rows||{}).reduce((a,[k,v])=>v?a+(PQ_ALL_SH[k]||0):a,0);
    add("PQ"+pre+" – Setup",sf(s.setupShifts,1.5)*r*pm,null,"51");
    add("PQ"+pre+" – Testing",ts*r*pm,null,"51");
    add("PQ"+pre+" – Teardown",sf(s.tdShifts,1.0)*r,null,"51");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // DCM instances
  dcms.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const r=sf(s.rate,DCM_SR),pm=s.pia||1;
    add("DCM"+pre+" – Setup",sf(s.setupShifts,1.5)*r*pm,null,"51");
    add("DCM"+pre+" – Testing",sf(s.testShifts,1.0)*r*pm,null,"51");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // AB/SB instances
  abs.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    add("Airborne Noise"+pre+" – Setup",sectionSetup(s,globalSetup),null,"12");
    add("Airborne Noise"+pre+" – Testing",sf(s.testing),null,"12");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });
  sbs.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    add("Structureborne Noise"+pre+" – Setup",sectionSetup(s,globalSetup),null,"12");
    add("Structureborne Noise"+pre+" – Testing",sf(s.testing),null,"12");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // Instrumentation — non-shock/vib items not already placed inline
  if(inst.on){
    const SKIP=new Set(["shock","cmShock","vib","cmVib","hsv"]);
    const P={};const L={};const IC={};
    Object.entries(inst.items||{}).forEach(([k,v])=>{
      if(!v?.on||SKIP.has(k))return;
      const prices={addl:1200};
      add(L[k]||k,(prices[k]||0)*sf(v.channels,1),null,"33");
    });
  }

  const anyMain=vibs.some(s=>s.on)||shocks.some(s=>s.on)||noises.some(s=>s.on)||
    envs.some(s=>s.on)||hfvs.some(s=>s.on)||shos.some(s=>s.on)||
    emis.some(s=>s.on)||pqs.some(s=>s.on)||dcms.some(s=>s.on);
  if(anyMain){
    const hasMW=shocks.some(s=>s.on&&s.cat==="Medium Weight");
    const hasLW=shocks.some(s=>s.on&&s.cat==="Lightweight");
    const hasVib=vibs.some(s=>s.on);
    const hasNoise=noises.some(s=>s.on);
    const hasAb=abs.some(s=>s.on)||sbs.some(s=>s.on);
    const hasEnvOnly=envs.some(s=>s.on)&&!hasMW&&!hasLW&&!hasVib&&!hasNoise&&!hasAb;
    const SIMPLE_ENV=["th","sf","alt"];
    const onlySimpleEnv=hasEnvOnly&&envs.every(s=>!s.on||Object.keys(s.items||{}).filter(k=>s.items[k]?.on).every(k=>SIMPLE_ENV.includes(k)));
    // totalSetup: vib + shock + noise + ab + sb setups (matching desktop)
    const totalSetup=
      vibs.filter(s=>s.on).reduce((a,s)=>a+sectionSetup(s,globalSetup),0)+
      shocks.filter(s=>s.on).reduce((a,s)=>a+(s.fromVib?
        (s.cat==="Medium Weight"?mwDisc(sectionSetup(vibs.find(v=>v.on)||{std:1000},globalSetup)):lwDisc(sectionSetup(vibs.find(v=>v.on)||{std:1000},globalSetup)))
        :sectionSetup(s,globalSetup)),0)+
      noises.filter(s=>s.on).reduce((a,s)=>a+sectionSetup(s,globalSetup),0)+
      abs.filter(s=>s.on).reduce((a,s)=>a+sectionSetup(s,globalSetup),0)+
      sbs.filter(s=>s.on).reduce((a,s)=>a+sectionSetup(s,globalSetup),0);
    // Teardown rules:
    // Base:       Vib=$750, LW shock only=$500, MW shock only=$750
    // Vib+MW:     $1000
    // Each of: Noise, AB/SB, complex Env, HFV/SHO adds $250, capped at $1500
    // Simple env only (T&H/SF/Alt): $500 flat
    // Skip if ONLY EMI/PQ/DCM (they include their own teardown shifts)
    const onlyShiftTests=!hasMW&&!hasLW&&!hasVib&&!hasNoise&&!hasAb&&
      !envs.some(s=>s.on)&&!hfvs.some(s=>s.on)&&!shos.some(s=>s.on)&&
      (emis.some(s=>s.on)||pqs.some(s=>s.on)||dcms.some(s=>s.on));
    if(!onlyShiftTests){
      let autoTd=0;
      if(onlySimpleEnv){
        autoTd=500;
      } else {
        // Base value from primary test type
        const hasHfv=hfvs.some(s=>s.on);
        const hasSho=shos.some(s=>s.on);
        if(hasVib && hasMW)       autoTd=1000;
        else if(hasVib)           autoTd=750;
        else if(hasMW)            autoTd=1000;
        else if(hasLW)            autoTd=500;
        else if(hasAb)            autoTd=750;
        else if(hasHfv||hasSho)   autoTd=500;
        // Additive bumps (each +$250, capped at $1500)
        if(hasNoise)                                      autoTd=Math.min(autoTd+250,1500);
        if(hasAb && (hasVib||hasMW||hasLW||hasNoise))     autoTd=Math.min(autoTd+250,1500);
        const hasComplexEnv=envs.some(s=>s.on)&&!onlySimpleEnv;
        if(hasComplexEnv)                                 autoTd=Math.min(autoTd+250,1500);
        if((hasHfv||hasSho) && (hasVib||hasMW||hasLW||hasNoise||hasAb)) autoTd=Math.min(autoTd+250,1500);
        if(autoTd===0) autoTd=500; // fallback for anything not covered
      }
      autoTd=Math.min(autoTd,1500);
      const tdVal=sf(td)>0?sf(td):autoTd;
      add("Tear Down",tdVal,null,"96");
    }
  }

  // Budget materials: add marked-up total to the selected setup line
  if(budget&&budget.on&&budget.rows.length>0){
    const mp=sf(budget.markup,25)/100;
    // Group rows by rollInto target
    const rollGroups={};
    budget.rows.forEach(r=>{
      const target=r.rollInto||"_none";
      if(!rollGroups[target])rollGroups[target]=0;
      rollGroups[target]+=sf(r.qty,1)*sf(r.unitCost,0)*(1+mp);
    });
    Object.entries(rollGroups).forEach(([target,amt])=>{
      if(amt<=0)return;
      if(target==="SEPARATE"||target==="_none"){
        add("Budget Materials",amt,null,"");
      } else {
        // Find matching line and add to its val
        const idx=lines.findIndex(l=>l.label===target);
        if(idx>=0)lines[idx]={...lines[idx],val:Math.round(lines[idx].val+amt)};
        else add("Budget ("+target+")",amt,null,"");
      }
    });
  }

  if(ot.on)ot.rows.forEach(r=>{
    const b=r.type==="Weekday"?300:825,h=r.type==="Weekday"?262.5:350;
    const total=b+sf(r.techs,1)*sf(r.hours,0)*h;
    if(total>0)add(r.label||"Overtime",total,null,r.pcode||"94");
  });
  if(custom.on)custom.rows.forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom Item",r.price,null,r.pcode||"94");});

  // Combined proc/report across all instances of all sections
  // Section proc/report prices — keyed by section type
  const PROC_PRICES={vib:PROC_BASE,shock:PROC_BASE,noise:PROC_BASE,env:PROC_BASE,hfv:PROC_BASE,sho:PROC_BASE,
    dcm:1950,pq:2925,emi:3425,ab:PROC_BASE,sb:PROC_BASE};
  const REP_PRICES={vib:REPORT_BASE,shock:REPORT_BASE,noise:REPORT_BASE,env:REPORT_BASE,hfv:REPORT_BASE,sho:REPORT_BASE,
    dcm:1500,pq:2450,emi:2850,ab:REPORT_BASE,sb:REPORT_BASE};
  const allSections=[
    ...vibs.filter(s=>s.on).map((s,i)=>({s,lbl:"Vibration"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"vib",unit:i})),
    ...shocks.filter(s=>s.on).map((s,i)=>({s,lbl:"Shock"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"shock",unit:i})),
    ...noises.filter(s=>s.on).map((s,i)=>({s,lbl:"Noise"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"noise",unit:i})),
    ...envs.filter(s=>s.on).map((s,i)=>({s,lbl:"Env"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"env",unit:i})),
    ...hfvs.filter(s=>s.on).map((s,i)=>({s,lbl:"HFV"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"hfv",unit:i})),
    ...shos.filter(s=>s.on).map((s,i)=>({s,lbl:"Shock (Other)"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"sho",unit:i})),
    ...dcms.filter(s=>s.on).map((s,i)=>({s,lbl:"DCM"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"dcm",unit:i})),
    ...pqs.filter(s=>s.on).map((s,i)=>({s,lbl:"PQ"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"pq",unit:i})),
    ...emis.filter(s=>s.on).map((s,i)=>({s,lbl:"EMI"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"emi",unit:i})),
    ...abs.filter(s=>s.on).map((s,i)=>({s,lbl:"Airborne Noise"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"ab",unit:i})),
    ...sbs.filter(s=>s.on).map((s,i)=>({s,lbl:"Structureborne Noise"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"sb",unit:i})),
  ];
  const procSecs=allSections.filter(({s})=>s.proc);
  const repSecs=allSections.filter(({s})=>s.report);

  // Get unique unit indices that have any procs/reports
  const procUnits=[...new Set(procSecs.map(x=>x.unit))].sort((a,b)=>a-b);
  const repUnits=[...new Set(repSecs.map(x=>x.unit))].sort((a,b)=>a-b);

  const addProcRepForUnit=(sections,type,unitIdx)=>{
    // type: 'proc' or 'rep'
    const unitSecs=sections.filter(x=>x.unit===unitIdx);
    if(unitSecs.length===0)return;
    const PRICES=type==='proc'?PROC_PRICES:REP_PRICES;
    const baseCode=type==='proc'?'42':'41';
    const specialCode=type==='proc'?'44':'43';
    const isUnit1=unitIdx===0;
    const unitLabel=unitIdx>0?" (Unit "+(unitIdx+1)+")":"";

    if(splitProcReport){
      unitSecs.forEach(({lbl,type:t})=>{
        const price=PRICES[t]||(type==='proc'?PROC_BASE:REPORT_BASE);
        const code=(t==="emi"||t==="dcm"||t==="pq")?specialCode:baseCode;
        const lineLabel=lbl+(type==='proc'?" – Test Procedure":" – Test Report");
        currentUnit=unitIdx; add(lineLabel,price,null,code);
      });
    } else {
      if(unitSecs.length===1){
        const {lbl,type:t}=unitSecs[0];
        const price=PRICES[t]||(type==='proc'?PROC_BASE:REPORT_BASE);
        const code=(t==="emi"||t==="dcm"||t==="pq")?specialCode:baseCode;
        const lineLabel=lbl+(type==='proc'?" – Test Procedure":" – Test Report");
        currentUnit=unitIdx; add(lineLabel,price,null,code);
      } else {
        const maxPrice=Math.max(...unitSecs.map(({type:t})=>PRICES[t]||(type==='proc'?PROC_BASE:REPORT_BASE)));
        const combined=Math.round((maxPrice+maxPrice*0.075*(unitSecs.length-1))/25)*25;
        const hasSpecial=unitSecs.some(({type:t})=>t==="emi"||t==="dcm"||t==="pq");
        const lineLabel=(isUnit1?"Combined ":"Combined ")+(type==='proc'?"Test Procedure":"Test Report")+unitLabel;
        currentUnit=unitIdx; add(lineLabel,combined,null,hasSpecial?specialCode:baseCode);
      }
    }
  };

  procUnits.forEach(u=>addProcRepForUnit(procSecs,'proc',u));
  repUnits.forEach(u=>addProcRepForUnit(repSecs,'rep',u));

  // Global proc/report/coc rows — procs go to procLines, reps/coc go to repLines via their codes
  (globalPR?.procs||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Test Procedure",r.price,null,"42");});
  (globalPR?.reps||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Test Report",r.price,null,"41");});
  if(globalPR?.coc)add("Certificate of Compliance",globalPR.cocPrice||"250",null,"41");
  if(sub.on)sub.rows.forEach(r=>{if(sf(r.price)>0)add(r.desc||"Subcontract Item",r.price,null,"98");});
  // Sort: procs first, then test lines grouped by unit, then reports last
  const procLines=lines.filter(l=>l.code==="42"||l.code==="44"||l.label.toLowerCase().includes("procedure"));
  const repLines=lines.filter(l=>l.code==="41"||l.code==="43"||l.label.toLowerCase().includes("test report")||l.label.toLowerCase().includes("combined test report"));
  const mainLines=lines.filter(l=>!procLines.includes(l)&&!repLines.includes(l));

  // Separate Tear Down from mainLines — it needs special placement
  const tdLine=mainLines.find(l=>l.label==="Tear Down");
  const mainNoTd=mainLines.filter(l=>l.label!=="Tear Down");

  // Split mainLines into mechanical (vib/shock/noise/env/hfv/sho/ab/sb/inst) vs shift-based (emi/pq/dcm)
  const SHIFT_CODES=new Set(["51"]);
  const mechLines=mainNoTd.filter(l=>!SHIFT_CODES.has(l.code));
  const shiftLines=mainNoTd.filter(l=>SHIFT_CODES.has(l.code));

  // Sort each group by unit then seq
  const byUnitSeq=(a,b)=>{
    const ud=(a.unit||0)-(b.unit||0);
    return ud!==0?ud:(a.seq||0)-(b.seq||0);
  };
  mechLines.sort(byUnitSeq);
  shiftLines.sort(byUnitSeq);

  // Tear Down goes after all mechanical lines, before shift-based lines
  const sortedMain=[...mechLines,...(tdLine?[tdLine]:[]),...shiftLines];
  // Proc order: general procs (42) first, then EMI (44), then DCM (44), then PQ (44)
  const sortedProcs=procLines.sort((a,b)=>{
    const order=l=>{
      if(l.label.toLowerCase().includes("emi"))return 2;
      if(l.label.toLowerCase().includes("dc mag")||l.label.toLowerCase().includes("dcm"))return 3;
      if(l.label.toLowerCase().includes("pq")||l.label.toLowerCase().includes("power quality"))return 4;
      return 1;
    };
    return order(a)-order(b);
  });
  // Report order: general (41) first, then EMI (43), then DCM, then PQ
  const sortedReps=repLines.sort((a,b)=>{
    const order=l=>{
      if(l.label.toLowerCase().includes("emi"))return 2;
      if(l.label.toLowerCase().includes("dc mag")||l.label.toLowerCase().includes("dcm"))return 3;
      if(l.label.toLowerCase().includes("pq")||l.label.toLowerCase().includes("power quality"))return 4;
      return 1;
    };
    return order(a)-order(b);
  });
  const sorted=[...sortedProcs,...sortedMain,...sortedReps];
  const setupLineLabels=sorted.filter(l=>l.label.toLowerCase().includes("setup")).map(l=>l.label);
  return{lines:sorted,total:sorted.reduce((s,l)=>s+l.val,0),setupLineLabels};
}

// ── Auto-specs helper ─────────────────────────────────────────────────────────
function buildSpecs(vibs,shocks,noises,envs,hfvs,shos,dcms,emis,pqs,abs,sbs){
  const lines=[];
  const sc=spec=>spec?" in accordance with "+spec.toUpperCase():"";
  vibs.filter(s=>s.on&&s.spec).forEach((s,i)=>{
    const fp=s.freqRange?", "+s.freqRange+" Hz":"";
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    lines.push("Type I Vibration"+pre+sc(s.spec)+fp+".");
  });
  shocks.filter(s=>s.on&&s.spec).forEach((s,i)=>{
    const parts=[];
    if(s.grade)parts.push("Grade "+s.grade);
    if(s.class_)parts.push("Class "+s.class_);
    if(s.type_)parts.push("Type "+s.type_);
    // Location — append "Mounted" for all options
    const loc=s.location||"Hull";
    const locStr=loc+" Mounted";
    if(s.submarine)parts.push("Submarine");
    parts.push(locStr);
    const orientStr=s.orientation&&s.orientation!=="Unrestricted"?s.orientation+" Orientation":"Unrestricted Orientation";
    parts.push(orientStr);
    if(s.blows)parts.push(s.blows+" blows");
    const det=parts.length?", "+parts.join(", "):"";
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    lines.push(s.cat+" Shock"+pre+sc(s.spec)+det+".");
  });
  noises.filter(s=>s.on).forEach((s,i)=>{
    const oasp=s.oaspl?", "+s.oaspl+" OASPL":"";
    const dur=s.durVal?" for "+s.durVal+" "+s.durUnit:"";
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    lines.push("Noise Susceptibility"+pre+sc(s.spec)+oasp+dur+".");
  });
  envs.filter(s=>s.on).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const thMap={"Temperature & Humidity":"Temperature & Humidity","Temperature Only":"Temperature","Humidity Only":"Humidity"};
    const it=s.items||{};
    if(it.th?.on){const t=thMap[s.thType]||s.thType;const customDur=s.thDurVal?(s.thDurVal+" "+(s.thDurUnit||"hours")):s.thDur?s.thDur:"";const dur=customDur?", "+customDur:"";lines.push(t+" testing"+pre+sc(it.th.spec||s.spec)+dur+".");}
    if(it.sf?.on)lines.push("Salt Fog testing"+pre+sc(it.sf.spec||s.spec)+".");
    if(it.alt?.on){const dw=s.altDwell?", "+s.altDwell+" dwell":"";lines.push("Altitude testing"+pre+sc(it.alt.spec||s.spec)+dw+".");}
    if(it.ess?.on){const dur=s.essDur||"10 minutes";lines.push("ESS testing"+pre+sc(it.ess.spec||s.spec)+", "+dur+" per axis.");}
    if(it.acc?.on)lines.push("Acceleration testing"+pre+sc(it.acc.spec||s.spec)+".");
    if(it.incl?.on)lines.push("Inclination testing"+pre+sc(it.incl.spec||s.spec)+".");
    if(it.rd?.on)lines.push("Rapid Decompression testing"+pre+sc(it.rd.spec||s.spec)+".");
    if(it.ed?.on)lines.push("Explosive Decompression testing"+pre+sc(it.ed.spec||s.spec)+".");
    if(it.drip?.on)lines.push("Drip Test"+pre+sc(it.drip.spec||s.spec)+".");
    if(it.sub?.on)lines.push("Submergence testing"+pre+sc(it.sub.spec||s.spec)+".");
    if(it.spray?.on)lines.push("Spray Test"+pre+sc(it.spray.spec||s.spec)+".");
  });
  hfvs.filter(s=>s.on&&s.spec).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    lines.push("Vibration testing"+pre+sc(s.spec)+", tested for "+(s.dur||"30")+" minutes per axis.");
  });
  shos.filter(s=>s.on&&s.spec).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    lines.push("Shock testing"+pre+sc(s.spec)+".");
  });
  dcms.filter(s=>s.on&&s.spec).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    lines.push("DC Magnetics"+pre+" in accordance with "+s.spec+".");
  });
  emis.filter(s=>s.on).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const selectedRev=Object.entries(s.revs||{}).filter(([,v])=>v).map(([k])=>k.replace("Rev ",""))[0]||"";
    const specStr=s.spec?s.spec.toUpperCase():("MIL-STD-461"+selectedRev);
    if(!specStr)return;
    const plats=Object.entries(s.plats||{}).filter(([,v])=>v).map(([k])=>k.toLowerCase());
    const locs=Object.entries(s.locs||{}).filter(([,v])=>v).map(([k])=>k.toLowerCase()+" applications");
    const parts=[specStr,...plats,...locs];
    lines.push("EMI testing"+pre+" in accordance with "+parts.join(", ")+".");
  });
  pqs.filter(s=>s.on).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const hasPart1=Object.entries(s.rows||{}).some(([k,v])=>v&&!k.includes("300b"));
    const has300b=Object.entries(s.rows||{}).some(([k,v])=>v&&k.includes("5.3.3"));
    if(hasPart1)lines.push("Power Quality testing"+pre+" in accordance with MIL-STD-1399, Section 300 Part 1.");
    if(has300b)lines.push("Power Quality testing"+pre+" in accordance with MIL-STD-1399, Section 300B.");
  });
  abs.filter(s=>s.on).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const spec=s.spec||("MIL-STD-"+s.rev);
    lines.push("Airborne Noise testing"+pre+" in accordance with "+spec+".");
  });
  sbs.filter(s=>s.on).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const spec=s.spec||("MIL-STD-"+s.rev);
    lines.push("Structureborne Noise testing"+pre+" in accordance with "+spec+".");
  });
  return lines.join("\n\n");
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App({onLogout,currentUser}){
  const [qi,setQi]=useState({opp:"",account:"",billTo:"",billToCity:"",contact:"",email:"",prepby:"",rev:"",revDate:"",date:new Date().toLocaleDateString("en-US"),rfq:"",stage:"Proposal/Price Quote",type:"New Business",relatedOpps:""});
  const [ti,setTi]=useState({item:"",qty:"1",model:"",drawing:"",loads:"",dimL:"",dimW:"",dimH:"",wt:"",volt:"",pwrType:"AC",phase:"",hz:"",inrush:"",amps:"",mounting:"",pressureFlow:"",gsi:"Unknown",witness:"Unknown",docRestriction:"None",dpas:"",tiSpecs:"",tiNotes:""});

  // Multi-instance section state — arrays of instance objects
  const [vibs,setVibs]=useState([newVib()]);
  const [shocks,setShocks]=useState([newShock()]);
  const [noises,setNoises]=useState([newNoise()]);
  const [envs,setEnvs]=useState([newEnv()]);
  const [hfvs,setHfvs]=useState([newHfv()]);
  const [shos,setShos]=useState([newSho()]);
  const [dcms,setDcms]=useState([newDcm()]);
  const [pqs,setPqs]=useState([newPq()]);
  const [emis,setEmis]=useState([newEmi()]);

  // Single-instance sections
  const [inst,setInst]=useState({on:false,items:{}});
  const [ot,setOt]=useState({on:false,rows:[]});
  const [custom,setCustom]=useState({on:false,rows:[]});
  const [budget,setBudget]=useState({on:false,rows:[],markup:"25"});
  const [coc,setCoc]=useState({on:false,price:"250"});
  const [sub,setSub]=useState({on:false,rows:[]});
  const [td,setTd]=useState("0");
  const [setup,setSetup]=useState({techRate:"175",fabHours:"4",holes:"0",cables:"0",drillTap:false});
  const [globalPR,setGlobalPR]=useState({procs:[],reps:[],coc:false,cocPrice:"250"});
  const [notes,setNotes]=useState("");
  const [lineOverrides,setLineOverrides]=useState({}); // {idx:{price,desc,deleted}}
  const [lineOrder,setLineOrder]=useState(null); // null=use default order; array of original indices when reordered
  const [dragIdx,setDragIdx]=useState(null);
  const [abs,setAbs]=useState([newAb()]);
  const [sbs,setSbs]=useState([newSb()]);
  const [locked,setLocked]=useState(false);
  const [splitProcReport,setSplitProcReport]=useState(false);
  // persist to saves
  const splitProcReportRef=splitProcReport;
  const [savedQuotes,setSavedQuotes]=useState(()=>loadQuotes());

  // ── Approval system ────────────────────────────────────────────────────────
  const [approval,setApproval]=useState({status:"none",submittedBy:"",submittedAt:"",decidedBy:"",decidedAt:"",comments:""});
  const [approvalComments,setApprovalComments]=useState("");
  const [showApprovalModal,setShowApprovalModal]=useState(false);
  const [wonInfo,setWonInfo]=useState({wonDate:"",jobNum:"",poNum:""});
  const [wonLocked,setWonLocked]=useState(false);
  const [showWonModal,setShowWonModal]=useState(false);
  const [showCloneModal,setShowCloneModal]=useState(false);
  const [cloneOppInput,setCloneOppInput]=useState("");
  const [currentQuoteId,setCurrentQuoteId]=useState(null);

  // EmailJS config — fill in after setting up emailjs.com
  const EMAILJS_SERVICE_ID  = "YOUR_SERVICE_ID";
  const EMAILJS_SUBMIT_TPL  = "YOUR_SUBMIT_TEMPLATE_ID";
  const EMAILJS_DECISION_TPL= "YOUR_DECISION_TEMPLATE_ID";
  const EMAILJS_PUBLIC_KEY  = "YOUR_PUBLIC_KEY";

  const APPROVERS=[
    {name:"Jordan McAdoo", email:"jordanmcadoo@nulabs.com"},
    {name:"Ragen McAdoo",  email:"ragenmcadoo@nulabs.com"},
    {name:"Russ McAdoo",   email:"russmcadoo@nulabs.com"},
  ];
  const APPROVER_EMAILS=APPROVERS.map(a=>a.email);
  const isApprover=APPROVER_EMAILS.includes(currentUser);

  const loadEmailJS=()=>new Promise((res,rej)=>{
    if(window.emailjs){res();return;}
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    s.onload=()=>{window.emailjs.init(EMAILJS_PUBLIC_KEY);res();}
    s.onerror=rej;
    document.head.appendChild(s);
  });

  const sendSubmitEmail=async(submitter)=>{
    try{
      await loadEmailJS();
      await window.emailjs.send(EMAILJS_SERVICE_ID,EMAILJS_SUBMIT_TPL,{
        quote_opp:   qi.opp||"Untitled",
        quote_rfq:   qi.rfq||"—",
        quote_total: money(summary.total),
        submitted_by:submitter,
        submitted_at:new Date().toLocaleString(),
        to_email:    APPROVERS.map(a=>a.email).join(","),
      });
    }catch(e){console.warn("EmailJS submit failed:",e);}
  };

  const sendDecisionEmail=async(decision,decider,comments,submitter)=>{
    try{
      await loadEmailJS();
      await window.emailjs.send(EMAILJS_SERVICE_ID,EMAILJS_DECISION_TPL,{
        quote_opp:   qi.opp||"Untitled",
        quote_rfq:   qi.rfq||"—",
        quote_total: money(summary.total),
        decision:    decision,
        decided_by:  decider,
        decided_at:  new Date().toLocaleString(),
        comments:    comments||"None",
        to_email:    submitter,
      });
    }catch(e){console.warn("EmailJS decision failed:",e);}
  };

  const handleSubmitApproval=async()=>{
    const newApproval={status:"pending",submittedBy:currentUser,submittedAt:new Date().toISOString(),decidedBy:"",decidedAt:"",comments:""};
    setApproval(newApproval);
    setLocked(true);
    setShowApprovalModal(false);
    const q={id:Date.now(),opp:qi.opp,customer:qi.customer,rfq:qi.rfq,total:summary.total,
      qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,wonInfo,approval:newApproval};
    setSavedQuotes(saveQuote(savedQuotes,q));
    await sendSubmitEmail(currentUser);
  };

  const handleApprove=async()=>{
    const newApproval={...approval,status:"approved",decidedBy:currentUser,decidedAt:new Date().toISOString(),comments:approvalComments};
    setApproval(newApproval);
    setApprovalComments("");
    const q={id:Date.now(),opp:qi.opp,customer:qi.customer,rfq:qi.rfq,total:summary.total,
      qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,wonInfo,approval:newApproval};
    setSavedQuotes(saveQuote(savedQuotes,q));
    await sendDecisionEmail("APPROVED",currentUser,approvalComments,approval.submittedBy);
  };

  const handleReject=async()=>{
    const newApproval={...approval,status:"rejected",decidedBy:currentUser,decidedAt:new Date().toISOString(),comments:approvalComments};
    setApproval(newApproval);
    setLocked(false);
    setApprovalComments("");
    const q={id:Date.now(),opp:qi.opp,customer:qi.customer,rfq:qi.rfq,total:summary.total,
      qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,wonInfo,approval:newApproval};
    setSavedQuotes(saveQuote(savedQuotes,q));
    await sendDecisionEmail("REJECTED",currentUser,approvalComments,approval.submittedBy);
  };

  const handleApproverUnlock=()=>{
    setLocked(false);
  };

  // Multi-instance helpers
  const mkUpdater=(_arr,setArr)=>(idx,val)=>setArr(prev=>prev.map((x,i)=>i===idx?(typeof val==="function"?val(x):val):x));
  const mkAdder=(_arr,setArr,newFn)=>()=>setArr(prev=>[...prev,{...newFn(),identifier:""}]);
  const mkRemover=(_arr,setArr)=>idx=>setArr(prev=>prev.filter((_,i)=>i!==idx));

  const vibSetup=vibs.find(v=>v.on)?sf(vibs.find(v=>v.on).setup):0;

  const summary=useMemo(()=>calcSummary(vibs,shocks,noises,envs,hfvs,shos,emis,pqs,dcms,abs,sbs,inst,ot,custom,td,coc,sub,globalPR,budget,setup,splitProcReport),
    [vibs,shocks,noises,envs,hfvs,shos,emis,pqs,dcms,abs,sbs,inst,ot,custom,td,coc,sub,globalPR,budget,setup,splitProcReport]);

  // Reset line order when summary length changes (new lines added/removed)
  useEffect(()=>setLineOrder(null),[summary.lines.length]);

  const autoSpecs=useMemo(()=>buildSpecs(vibs,shocks,noises,envs,hfvs,shos,dcms,emis,pqs,abs,sbs),
    [vibs,shocks,noises,envs,hfvs,shos,dcms,emis,pqs,abs,sbs]);

  const autoNotes=useMemo(()=>{
    const lines=[];
    if(noises.some(s=>s.on))lines.push("Frequencies below 100Hz to be performed as a best effort. All cabling that connects to the unit should be a minimum of 20 feet unless otherwise discussed.");
    if(noises.some(s=>s.on&&s.level==="170dB"))lines.push("OASPLs greater than 170dB will be performed as a best effort.");
    if(pqs.some(s=>s.on&&s.cw))lines.push("Current Waveform testing performed using facility power.");
    if(emis.some(s=>s.on)){
      lines.push("EMI Notes:\n"+
        "* This quote assumes that the susceptibility criteria can be determined in less than 3 seconds during real-time operation of the EUT, and that if additional monitoring personnel are needed, they would be provided by the customer. Customer to supply cables and all peripheral and monitoring equipment, and one mode of operation (operating or standby). Susceptibility determination provided by the customer. Pricing is based on customer-supplied information, the assumptions listed here, and acceptance of an approved test procedure.\n"+
        "* Pricing and feasibility may be reevaluated upon completion and review of the NU Laboratories Test Configuration Form.\n"+
        "* This quote assumes that the number of cables and outside diameter of the cables under test are within NU Laboratories capabilities/limitations.\n"+
        "* Pricing assumes the standard list of tests from MIL-STD-461G, and that all testing is performed at NU Labs. Any tests requiring subcontracting will incur additional charges."
      );
    }
    lines.push("Refer to the notes section at the bottom of this quote for additional details.");
    return lines.join("\n\n");
  },[noises,pqs,emis,abs,sbs]);

  const anyOn=vibs.some(s=>s.on)||shocks.some(s=>s.on)||noises.some(s=>s.on)||envs.some(s=>s.on)||
    hfvs.some(s=>s.on)||shos.some(s=>s.on)||dcms.some(s=>s.on)||pqs.some(s=>s.on)||emis.some(s=>s.on)||
    abs.some(s=>s.on)||sbs.some(s=>s.on)||inst.on||ot.on||custom.on||globalPR.coc||globalPR.procs.length>0||globalPR.reps.length>0;

  // Clone quote — optionally save original first, then open modal for new opp #
  const handleClone=()=>{
    const result=window.confirm("Save the current quote before cloning?\n\nClick OK to save first, or Cancel to clone without saving.");
    if(result){
      const q={id:Date.now(),opp:qi.opp,customer:qi.customer,rfq:qi.rfq,total:summary.total,
        qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,wonInfo};
      setSavedQuotes(saveQuote(savedQuotes,q));
    }
    setCloneOppInput("");
    setShowCloneModal(true);
  };

  const doClone=(newOpp)=>{
    setQi(q=>({...q,opp:newOpp,rfq:"",rev:"",revDate:"",date:new Date().toLocaleDateString("en-US"),stage:"Proposal/Price Quote"}));
    setWonInfo({wonDate:"",jobNum:"",poNum:""});
    setWonLocked(false);
    setCurrentQuoteId(null);
    setApproval({status:"none",submittedBy:"",submittedAt:"",decidedBy:"",decidedAt:"",comments:""});
    setShowCloneModal(false);
    setCloneOppInput("");
    window.scrollTo({top:0,behavior:"smooth"});
  };

  // New quote — prompt to save, then reset everything to blank
  const handleNewQuote=()=>{
    const result=window.confirm("Save the current quote before starting a new one?\n\nClick OK to save, or Cancel to discard and continue.");
    if(result){
      const id=currentQuoteId||Date.now();
      const q={id,opp:qi.opp,customer:qi.customer,rfq:qi.rfq,total:summary.total,
        qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,wonInfo};
      setSavedQuotes(saveQuote(savedQuotes,q));
    }
    // Reset all state to blank defaults
    setQi({opp:"",account:"",billTo:"",billToCity:"",contact:"",email:"",prepby:"",rev:"",revDate:"",date:new Date().toLocaleDateString("en-US"),rfq:"",stage:"Proposal/Price Quote",type:"New Business",relatedOpps:""});
    setTi({item:"",qty:"1",model:"",drawing:"",loads:"",dimL:"",dimW:"",dimH:"",wt:"",volt:"",pwrType:"AC",phase:"",hz:"",inrush:"",amps:"",mounting:"",pressureFlow:"",gsi:"Unknown",witness:"Unknown",docRestriction:"None",dpas:"",tiSpecs:"",tiNotes:""});
    setVibs([newVib()]); setShocks([newShock()]); setNoises([newNoise()]); setEnvs([newEnv()]);
    setHfvs([newHfv()]); setShos([newSho()]); setDcms([newDcm()]); setPqs([newPq()]);
    setEmis([newEmi()]); setAbs([newAb()]); setSbs([newSb()]);
    setInst({on:false,items:{}}); setOt({on:false,rows:[]}); setCustom({on:false,rows:[]});
    setBudget({on:false,rows:[],markup:"25"}); setSub({on:false,rows:[]});
    setTd("0"); setSetup({techRate:"175",fabHours:"4",holes:"0",cables:"0",drillTap:false});
    setGlobalPR({procs:[],reps:[],coc:false,cocPrice:"250"});
    setNotes(""); setLineOverrides({}); setLineOrder(null);
    setWonInfo({wonDate:"",jobNum:"",poNum:""}); setWonLocked(false);
    setApproval({status:"none",submittedBy:"",submittedAt:"",decidedBy:"",decidedAt:"",comments:""});
    setLocked(false); setCurrentQuoteId(null);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  // Save quote to localStorage
  const handleSave=()=>{
    const id=currentQuoteId||Date.now();
    setCurrentQuoteId(id);
    const q={id,opp:qi.opp,customer:qi.customer,rfq:qi.rfq,total:summary.total,
      qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,wonInfo};
    const updated=saveQuote(savedQuotes,q);
    setSavedQuotes(updated);
    alert("Quote saved: "+(qi.opp||"Untitled"));
  };

  // Delete current quote from repository
  const handleDeleteQuote=()=>{
    if(!currentQuoteId){alert("This quote hasn't been saved yet — nothing to delete.");return;}
    const confirmed=window.confirm("Are you sure you want to delete this quote? You cannot retrieve it once deleted.");
    if(!confirmed)return;
    const updated=deleteQuote(savedQuotes,currentQuoteId);
    setSavedQuotes(updated);
    setCurrentQuoteId(null);
    alert("Quote deleted.");
  };

  // Load quote from search
  const handleLoad=q=>{
    if(q.qi)setQi(q.qi);
    if(q.ti)setTi(q.ti);
    if(q.vibs)setVibs(q.vibs);
    if(q.shocks)setShocks(q.shocks);
    if(q.noises)setNoises(q.noises);
    if(q.envs)setEnvs(q.envs);
    if(q.hfvs)setHfvs(q.hfvs);
    if(q.shos)setShos(q.shos);
    if(q.dcms)setDcms(q.dcms);
    if(q.pqs)setPqs(q.pqs);
    if(q.emis)setEmis(q.emis);
    if(q.abs)setAbs(q.abs);
    if(q.sbs)setSbs(q.sbs);
    if(q.globalPR)setGlobalPR(q.globalPR);
    if(q.splitProcReport!==undefined)setSplitProcReport(q.splitProcReport);
    if(q.notes)setNotes(q.notes);
    if(q.inst)setInst(q.inst);
    if(q.ot)setOt(q.ot);
    if(q.custom)setCustom(q.custom);
    if(q.budget)setBudget(q.budget);
    // coc now in globalPR
    if(q.sub)setSub(q.sub);
    if(q.td)setTd(q.td);
    if(q.setup)setSetup(q.setup);
    if(q.approval)setApproval(q.approval); else setApproval({status:"none",submittedBy:"",submittedAt:"",decidedBy:"",decidedAt:"",comments:""});
    if(q.wonInfo)setWonInfo(q.wonInfo); else setWonInfo({wonDate:"",jobNum:"",poNum:""});
    setWonLocked(false);
    setCurrentQuoteId(q.id||null);
  };

  const setupProps={setup};

  // ── PDF Logo (dark text, transparent bg for white PDF background) ──
  const NU_LOGO_PDF = "data:image/png;base64,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";

  
  const JORDAN_SIG_PDF = "data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAQABgADASIAAhEBAxEB/8QAHQABAAICAwEBAAAAAAAAAAAAAAcIBgkBBAUDAv/EAE4QAAIBAwMCBAMEBwUFBgUCBwABAgMEBQYHERIhCDFBURMiYRQyQnEJI1JicoGRFRYzgqEXJEOSoiVTY3ODsTQ1o7KzwVSTGETC0dLh/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ALlAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//9k=";
const STANDARD_TERMS = [
    "All work to be performed during normal business hours unless specifically noted on this quote.",
    "Customer is to supply all installation hardware, cables, hoses, mating connections for power or fluid, electrical/resistive and dummy loads, and specialized monitoring equipment/peripheral equipment unless other arrangements with NU Laboratories, Inc. have been made. No functional testing shall be performed by NU Laboratories or its personnel unless specifically addressed in our quotation.",
    "All equipment, including the UUT, support equipment, test fixtures, mounting brackets, etc. are to be delivered to NU Laboratories no later than (5) business days prior to the scheduled testing start date.",
    "Return shipping arrangements are to be provided prior to the start of testing. If not, storage charges will apply beginning (5) business days after the completion of testing.",
    "If applicable, all import and export documentation is to be provided by the customer.",
    "Out of scope work including additional efforts and standby charges are to be determined at NU Laboratories' discretion and will be quoted separately.",
    "This quote does not guarantee a specific testing schedule, nor does it represent a fixed number of testing days. Scheduling will be secured with the receipt of a purchase order and/or test procedure approval.",
    "The provided quote is based on a pass scenario and does not account for any additional time required due to test item malfunctions or failures. Should the customer's representative request a retest or engineering evaluation, a separate quote will be issued.",
    "Any requested lead times are estimated and may be subject to change.",
    "This quote is based on a total purchase and is good for a period of 90 days.",
    "All hardware provided by NU Laboratories is assumed to be SAE Grade 5. All fixturing provided by NU Laboratories is assumed to be A36 Steel. All other hardware and fixture requirements will be quoted separately if not detailed on this quote.",
  ];

  const exportPDF = () => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => {
      const script2 = document.createElement("script");
      script2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
      script2.onload = () => buildPDF(false);
      document.head.appendChild(script2);
    };
    document.head.appendChild(script);
  };

  const exportBudgetPDF = () => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => {
      const script2 = document.createElement("script");
      script2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
      script2.onload = () => buildPDF(true);
      document.head.appendChild(script2);
    };
    document.head.appendChild(script);
  };

  const exportDcMagPDF = () => {
    if(window.jspdf){buildDcMagPDF();return;}
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => buildDcMagPDF();
    document.head.appendChild(script);
  };

  const buildDcMagPDF = () => {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit:"pt",format:"letter"});
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 54, MR = 54, TW = PW - ML - MR;
    const RED = [192,57,43], DARK = [30,30,30], MUTED = [100,100,100], LIGHT = [240,240,240], GREEN = [22,101,52];
    let y = 44;

    const setF = (style, size, color) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...(color||DARK));
    };
    const drawFooter = () => {
      setF('normal', 8, MUTED);
      doc.text('NU Laboratories, Inc. | '+(qi.opp||''), ML, PH-18);
      doc.text('Page 1 | '+(qi.revDate||qi.date||''), PW-MR, PH-18, {align:'right'});
      doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
      doc.line(ML, PH-26, PW-MR, PH-26);
    };

    // ── Header ──
    try { doc.addImage(NU_LOGO_PDF, 'PNG', ML, y, 180, 40); }
    catch(e) { setF('bold', 14, RED); doc.text('NU LABORATORIES', ML, y+28); }
    setF('normal', 8.5, DARK);
    ['312 Old Allerton Road','Annandale, NJ 08801-3206',
     'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
      .forEach((l,i) => doc.text(l, PW-MR, y+14+i*11, {align:'right'}));
    y += 54;
    doc.setDrawColor(...RED); doc.setLineWidth(1.5);
    doc.line(ML, y, PW-MR, y);
    y += 18;

    // ── Title block ──
    setF('bold', 13, DARK); doc.text('DC MAGNETICS', ML, y);
    setF('normal', 8.5, MUTED); doc.text('Test Specifications', ML, y+13);
    setF('normal', 9, MUTED); doc.text('Date: '+(qi.revDate||qi.date||''), PW-MR, y, {align:'right'});
    if(qi.opp){ setF('bold',9,DARK); doc.text(qi.opp, PW-MR, y+13, {align:'right'}); }
    y += 34;
    doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
    doc.line(ML, y, PW-MR, y);
    y += 18;

    // ── Test Item Details ──
    doc.setFillColor(...LIGHT);
    doc.rect(ML, y-2, TW, 18, 'F');
    doc.setFillColor(...RED); doc.rect(ML, y-2, 3, 18, 'F');
    setF('bold', 9, RED); doc.text('TEST ITEM', ML+10, y+10);
    y += 22;

    const sizeStr = [ti.dimL&&ti.dimL+'"', ti.dimW&&ti.dimW+'"', ti.dimH&&ti.dimH+'"'].filter(Boolean).join(' x ');
    const pwrParts = [ti.volt&&ti.volt+' V '+(ti.pwrType||'AC'), ti.phase&&ti.phase+' Ph', ti.hz&&ti.hz+' Hz', ti.amps&&ti.amps+' A'].filter(Boolean);

    const tiRows = [
      ['Unit', ti.item],
      ['Dimensions', sizeStr],
      ['Weight', ti.wt&&ti.wt+' lbs'],
      ['Power', pwrParts.join(', ')],
    ].filter(r=>r[1]);

    tiRows.forEach(([label, value], i) => {
      doc.setFillColor(...(i%2===0?[255,255,255]:[247,248,250]));
      doc.rect(ML, y-2, TW, 16, 'F');
      setF('bold', 9, MUTED); doc.text(label, ML+8, y+9);
      setF('normal', 9, DARK); doc.text(String(value), ML+110, y+9);
      y += 16;
    });
    y += 16;

    // ── Test Specification block ──
    doc.setFillColor(...LIGHT);
    doc.rect(ML, y-2, TW, 18, 'F');
    doc.setFillColor(...RED); doc.rect(ML, y-2, 3, 18, 'F');
    setF('bold', 9, RED); doc.text('TEST SPECIFICATION', ML+10, y+10);
    y += 28;

    // Spec box — clean bordered card, no fill
    doc.setFillColor(247,248,250);
    doc.setDrawColor(...LIGHT);
    doc.setLineWidth(0.5);
    doc.rect(ML, y, TW, 90, 'FD');
    doc.setFillColor(...RED); doc.rect(ML, y, 3, 90, 'F');

    setF('bold', 11, DARK); doc.text('DC Magnetics', ML+14, y+18);
    setF('normal', 8.5, MUTED); doc.text('DOD-STD-1399 Section 070', ML+14, y+30);

    doc.setDrawColor(220,220,220); doc.setLineWidth(0.4);
    doc.line(ML+14, y+38, ML+TW-14, y+38);

    const specRows=[['Field Strength','1,600 A/m'],['Positions','Three (3) orthogonal positions']];
    specRows.forEach(([lbl,val],i)=>{
      setF('normal',9,MUTED); doc.text(lbl+':', ML+14, y+52+i*18);
      setF('bold',9,DARK);    doc.text(val,          ML+110, y+52+i*18);
    });
    y += 106;

    // ── General Notes ──
    y += 8;
    doc.setFillColor(...LIGHT);
    doc.rect(ML, y-2, TW, 18, 'F');
    doc.setFillColor(...RED); doc.rect(ML, y-2, 3, 18, 'F');
    setF('bold', 9, RED); doc.text('GENERAL NOTES', ML+10, y+10);
    y += 20;
    const generalNotes = [
      'Pricing is based on customer-supplied information and the assumptions listed herein.',
      'Feasibility of testing will be reviewed upon receipt of a purchase order and/or test procedure approval.',
      'The number of tests required for each test method and/or the number of test positions listed in this document are estimated values. Exact quantities will be determined and documented in the approved test procedure.',
    ];
    setF('normal', 9, DARK);
    generalNotes.forEach(note => {
      const w = doc.splitTextToSize('*  ' + note, TW - 10);
      checkY(w.length*13+6);
      doc.text(w, ML+6, y); y += w.length*13+6;
    });
    y += 4;

    // ── DCM instances — spec fields if filled ──
    const activeDcms = dcms.filter(s=>s.on);
    if(activeDcms.length>0 && activeDcms.some(s=>s.spec)){
      y += 8;
      doc.setFillColor(...LIGHT);
      doc.rect(ML, y-2, TW, 18, 'F');
      doc.setFillColor(...RED); doc.rect(ML, y-2, 3, 18, 'F');
      setF('bold', 9, RED); doc.text('ADDITIONAL NOTES', ML+10, y+10);
      y += 22;
      activeDcms.forEach((s,i)=>{
        if(!s.spec) return;
        const label = activeDcms.length>1 ? 'Unit #'+(i+1)+(s.identifier?' ('+s.identifier+')':'') : 'Specification';
        setF('bold',9,MUTED); doc.text(label+':', ML+8, y);
        setF('normal',9,DARK); doc.text(s.spec, ML+110, y);
        y += 14;
      });
    }

    drawFooter();
    const fname = (qi.opp||'DC-Mag-Specs')+(qi.rev?' Rev '+qi.rev:'')+'.pdf';
    doc.save(fname);
  };

  const exportPq300bPDF = () => {
    if(window.jspdf){buildPq300bPDF();return;}
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => buildPq300bPDF();
    document.head.appendChild(script);
  };

  const buildPq300bPDF = () => {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit:"pt",format:"letter"});
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 54, MR = 54, TW = PW - ML - MR;
    const RED = [192,57,43], DARK = [30,30,30], MUTED = [100,100,100], LIGHT = [240,240,240], BLUE = [26,82,118];
    let y = 44;
    let pageNum = 1;

    const setF = (style, size, color) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...(color||DARK));
    };
    const checkY = (need) => {
      if(y + (need||20) > PH - 52){
        drawFooter();
        doc.addPage();
        pageNum++;
        y = 54;
      }
    };
    const drawFooter = () => {
      const p = doc.internal.getCurrentPageInfo().pageNumber;
      setF('normal', 8, MUTED);
      doc.text('NU Laboratories, Inc. | '+(qi.opp||''), ML, PH-18);
      doc.text('Page '+p+' | '+(qi.revDate||qi.date||''), PW-MR, PH-18, {align:'right'});
      doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
      doc.line(ML, PH-26, PW-MR, PH-26);
    };
    const sectionHdr = (title) => {
      checkY(28);
      y += 8;
      doc.setFillColor(...LIGHT);
      doc.rect(ML, y-2, TW, 18, 'F');
      doc.setFillColor(...RED); doc.rect(ML, y-2, 3, 18, 'F');
      setF('bold', 9, RED); doc.text(title.toUpperCase(), ML+10, y+10);
      y += 22;
    };

    // ── Header ──
    try { doc.addImage(NU_LOGO_PDF, 'PNG', ML, y, 180, 40); }
    catch(e) { setF('bold', 14, RED); doc.text('NU LABORATORIES', ML, y+28); }
    setF('normal', 8.5, DARK);
    ['312 Old Allerton Road','Annandale, NJ 08801-3206',
     'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
      .forEach((l,i) => doc.text(l, PW-MR, y+14+i*11, {align:'right'}));
    y += 54;
    doc.setDrawColor(...RED); doc.setLineWidth(1.5);
    doc.line(ML, y, PW-MR, y);
    y += 18;

    // ── Title ──
    setF('bold', 13, DARK); doc.text('POWER QUALITY', ML, y);
    setF('normal', 8.5, MUTED); doc.text('MIL-STD-1399 Section 300B — Test Specifications', ML, y+13);
    setF('normal', 9, MUTED); doc.text('Date: '+(qi.revDate||qi.date||''), PW-MR, y, {align:'right'});
    if(qi.opp){ setF('bold',9,DARK); doc.text(qi.opp, PW-MR, y+13, {align:'right'}); }
    y += 34;
    doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
    doc.line(ML, y, PW-MR, y);
    y += 16;

    // ── Test Item ──
    sectionHdr('Test Item');
    const sizeStr = [ti.dimL&&ti.dimL+'"',ti.dimW&&ti.dimW+'"',ti.dimH&&ti.dimH+'"'].filter(Boolean).join(' x ');
    const pwrParts = [ti.volt&&ti.volt+' V '+(ti.pwrType||'AC'),ti.phase&&ti.phase+' Ph',ti.hz&&ti.hz+' Hz',ti.amps&&ti.amps+' A'].filter(Boolean);
    [['Unit',ti.item],['Dimensions',sizeStr],['Weight',ti.wt&&ti.wt+' lbs'],['Power',pwrParts.join(', ')]]
      .filter(r=>r[1]).forEach(([label,value],i)=>{
        doc.setFillColor(...(i%2===0?[255,255,255]:[247,248,250]));
        doc.rect(ML, y-2, TW, 16, 'F');
        setF('bold',9,MUTED); doc.text(label, ML+8, y+9);
        setF('normal',9,DARK); doc.text(String(value), ML+110, y+9);
        y += 16;
      });
    y += 10;

    // ── Full 300B test data ──
    const PQ_300B_FULL = [
      {key:"B5.3.1", label:"Voltage and frequency tolerance test",
       req:"Type 1 single phase (123/107) V ac, (62/57) Hz",
       ref:"Table II for shipboard and submarine applications",
       note:null},
      {key:"B5.3.2", label:"Voltage and frequency transient tolerance and recovery test",
       req:"138 V ac / 63.3 Hz; 92 V ac / 56.7 Hz",
       ref:"Table III",
       note:null},
      {key:"B5.3.3", label:"Voltage spike test",
       req:"900 to 1000 V peak line-to-line and line-to-ground, or 2400 to 2500 V peak line-to-line and line-to-ground",
       ref:"Figure 23, 24 or 25",
       note:"Voltage spike impulse wave shape using IEC 61000-4-5 1.2/50 uS open circuit waveform definition. Overshoot may exceed figure. Or voltage spike impulse wave shape of Figure 6 NAVSEA deviation for light fixtures (MIL-DTL-16377 SSL)."},
      {key:"B5.3.4", label:"Emergency condition test",
       req:"70 ms dropout, 2 minute dropout; voltage and frequency decay characteristics for half-load curve; 67.2 Hz for 2 minutes / 155.25 V ac for 2 min",
       ref:"Figure 8, Table VI",
       note:null},
      {key:"B5.3.5", label:"Grounding test",
       req:"100,000-ohm; each lead grounded individually for 5 minutes",
       ref:null,
       note:null},
      {key:"B5.3.6", label:"User equipment power profile test",
       req:"User voltage and power characteristics per Section 5.3.6 a. through m. as required",
       ref:null,
       note:"Inrush current measurement may be limited by the capabilities of the AC source used, which may not cover 10x nominal current or higher. If inrush exceeds source capability the measurement cannot be made as desired. Will report what is measured and make a best effort attempt using facility power directly (5 attempts)."},
      {key:"B5.3.7", label:"Current waveform test",
       req:"120 Hz to 20 kHz, < 1 kVA limits as applicable",
       ref:null,
       note:"Requirement met using MIL-STD-461F/G test method CE101 with frequency extended to 20 kHz. A non-regulated power source may be needed as regulated source switching produces inconsistent current waveform data. Not required for currents < 1 A per NAVSEA."},
      {key:"B5.3.8", label:"Voltage and frequency modulation test",
       req:"Frequency modulation 0.5%; voltage modulation 2%. Periods of 17 ms, 75 ms, 250 ms, 500 ms, 1 s, 5 s and 10 s each repeated ten consecutive times",
       ref:"Table VII",
       note:null},
      {key:"B5.3.9", label:"Simulated human body leakage current test",
       req:"60 Hz to 700 Hz < 5 mA; 700 Hz to 100 kHz < 70 mA",
       ref:"Figure 28, Figure 31",
       note:null},
      {key:"B5.3.10.1", label:"Equipment insulation resistance test",
       req:"500 V dc for 60 seconds; resistance to ground > 10 MOhm",
       ref:null,
       note:null},
      {key:"B5.3.10.2", label:"Active ground detection test",
       req:"For 440 V rms EUT: AC source 622.2 V peak, DC source 505 VDC. For 115 V rms EUT: AC source 162.6 V peak, DC source 155 VDC.",
       ref:null,
       note:"AGD is run on one line only per NAVSEA direction. Verify if legacy requirements apply."},
    ];

    // Only show rows selected by the user across all active PQ instances
    const selectedKeys = new Set();
    pqs.filter(s=>s.on).forEach(s=>{
      PQ_300B_FULL.forEach(r=>{ if(s.rows?.[r.key]) selectedKeys.add(r.key); });
    });
    const activeRows = PQ_300B_FULL.filter(r=>selectedKeys.has(r.key));

    if(activeRows.length===0){
      setF('normal',10,MUTED); doc.text('No MIL-STD-1399 Section 300B tests selected.', ML, y); y+=20;
    } else {
      sectionHdr('MIL-STD-1399 Section 300B — Selected Tests');

      activeRows.forEach((r,idx)=>{
        const WRAP = TW - 20;
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
        const hdrLines  = doc.splitTextToSize(r.key.replace('B','')+' — '+r.label, WRAP);
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
        const reqLines  = r.req ? doc.splitTextToSize(r.req, WRAP) : [];
        doc.setFont('helvetica','normal'); doc.setFontSize(8);
        const refLines  = r.ref ? doc.splitTextToSize('Tables / Figures: '+r.ref, WRAP) : [];
        doc.setFont('helvetica','italic'); doc.setFontSize(7.5);
        const noteLines = r.note ? doc.splitTextToSize('Note: '+r.note, WRAP) : [];
        const rowH = hdrLines.length*14+8
          + (reqLines.length>0 ? reqLines.length*12+6 : 0)
          + (refLines.length>0 ? refLines.length*11+5 : 0)
          + (noteLines.length>0 ? noteLines.length*12+6 : 0)
          + 10;

        checkY(rowH+2);
        doc.setFillColor(...(idx%2===0?[238,244,250]:[230,238,246]));
        doc.rect(ML, y, TW, hdrLines.length*13+10, 'F');
        doc.setFillColor(255,255,255);
        doc.rect(ML, y+hdrLines.length*13+10, TW, rowH-(hdrLines.length*13+10), 'F');

        let ry=y+12;
        setF('bold',8.5,BLUE); doc.text(hdrLines, ML+8, ry); ry+=hdrLines.length*14+4;
        if(reqLines.length>0){ setF('normal',8.5,DARK); doc.text(reqLines, ML+10, ry); ry+=reqLines.length*12+6; }
        if(refLines.length>0){ setF('normal',8,MUTED); doc.text(refLines, ML+10, ry); ry+=refLines.length*11+5; }
        if(noteLines.length>0){ setF('italic',7.5,[110,85,40]); doc.text(noteLines, ML+10, ry); ry+=noteLines.length*12+5; }

        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.4);
        doc.line(ML, y+rowH, ML+TW, y+rowH);
        y += rowH;
      });
      y += 8;
    }

    // ── General Notes — force new page ──
    drawFooter();
    doc.addPage();
    y=54;
    sectionHdr('General Notes');
    y+=4;
    const generalNotes = [
      'Pricing is based on customer-supplied information and the assumptions listed herein.',
      'Feasibility of testing will be reviewed upon receipt of a purchase order and/or test procedure approval.',
      'The number of tests required for each test method and/or the number of test positions listed in this document are estimated values. Exact quantities will be determined and documented in the approved test procedure.',
    ];
    generalNotes.forEach((note,i)=>{
      const w=doc.splitTextToSize(note, TW-22);
      const blockH=w.length*13+10;
      checkY(blockH+4);
      doc.setFillColor(...LIGHT); doc.circle(ML+8,y+5,5,'F');
      setF('bold',8,MUTED); doc.text(String(i+1),ML+8,y+8,{align:'center'});
      setF('normal',9,DARK); doc.text(w, ML+20, y+8);
      y+=blockH;
    });
    y+=4;

    const fname = (qi.opp||'PQ-300B-Specs')+(qi.rev?' Rev '+qi.rev:'')+'.pdf';
    doc.save(fname);
  };

  const exportEmi461fPDF = () => {
    if(window.jspdf){buildEmi461fPDF();return;}
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => buildEmi461fPDF();
    document.head.appendChild(script);
  };

  const buildEmi461fPDF = () => {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit:"pt",format:"letter"});
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 54, MR = 54, TW = PW - ML - MR;
    const RED=[192,57,43],DARK=[30,30,30],MUTED=[100,100,100],LIGHT=[240,240,240],BLUE=[26,82,118];
    let y = 44;

    const setF=(style,size,color)=>{doc.setFont('helvetica',style);doc.setFontSize(size);doc.setTextColor(...(color||DARK));};
    const checkY=(need)=>{if(y+(need||20)>PH-52){drawFooter();doc.addPage();y=54;}};
    const drawFooter=()=>{
      const p=doc.internal.getCurrentPageInfo().pageNumber;
      setF('normal',8,MUTED);
      doc.text('NU Laboratories, Inc. | '+(qi.opp||''),ML,PH-18);
      doc.text('Page '+p+' | '+(qi.revDate||qi.date||''),PW-MR,PH-18,{align:'right'});
      doc.setDrawColor(...LIGHT);doc.setLineWidth(0.5);doc.line(ML,PH-26,PW-MR,PH-26);
    };
    const sectionHdr=(title)=>{
      checkY(28);y+=8;
      doc.setFillColor(...LIGHT);doc.rect(ML,y-2,TW,18,'F');
      doc.setFillColor(...RED);doc.rect(ML,y-2,3,18,'F');
      setF('bold',9,RED);doc.text(title.toUpperCase(),ML+10,y+10);y+=22;
    };

    // ── Header ──
    try{doc.addImage(NU_LOGO_PDF,'PNG',ML,y,180,40);}
    catch(e){setF('bold',14,RED);doc.text('NU LABORATORIES',ML,y+28);}
    setF('normal',8.5,DARK);
    ['312 Old Allerton Road','Annandale, NJ 08801-3206',
     'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
      .forEach((l,i)=>doc.text(l,PW-MR,y+14+i*11,{align:'right'}));
    y+=54;
    doc.setDrawColor(...RED);doc.setLineWidth(1.5);doc.line(ML,y,PW-MR,y);y+=18;

    // ── Title ──
    setF('bold',13,DARK);doc.text('EMI TESTING',ML,y);
    setF('normal',8.5,MUTED);doc.text('MIL-STD-461F -- Test Specifications',ML,y+13);
    setF('normal',9,MUTED);doc.text('Date: '+(qi.revDate||qi.date||''),PW-MR,y,{align:'right'});
    if(qi.opp){setF('bold',9,DARK);doc.text(qi.opp,PW-MR,y+13,{align:'right'});}
    y+=34;
    doc.setDrawColor(...LIGHT);doc.setLineWidth(0.5);doc.line(ML,y,PW-MR,y);y+=16;

    // ── Test Item ──
    sectionHdr('Test Item');
    const sizeStr=[ti.dimL&&ti.dimL+'"',ti.dimW&&ti.dimW+'"',ti.dimH&&ti.dimH+'"'].filter(Boolean).join(' x ');
    const pwrParts=[ti.volt&&ti.volt+' V '+(ti.pwrType||'AC'),ti.phase&&ti.phase+' Ph',ti.hz&&ti.hz+' Hz',ti.amps&&ti.amps+' A'].filter(Boolean);
    [['Unit',ti.item],['Dimensions',sizeStr],['Weight',ti.wt&&ti.wt+' lbs'],['Power',pwrParts.join(', ')]]
      .filter(r=>r[1]).forEach(([label,value],i)=>{
        doc.setFillColor(...(i%2===0?[255,255,255]:[247,248,250]));
        doc.rect(ML,y-2,TW,16,'F');
        setF('bold',9,MUTED);doc.text(label,ML+8,y+9);
        const valLines=doc.splitTextToSize(String(value),TW-112);
        setF('normal',9,DARK);doc.text(valLines,ML+110,y+9);
        y+=16;
      });
    y+=10;

    // Compute all positions and test counts from the same math as shift calculations
    const activeEmi = emis.find(s=>s.on)||(emis[0]||{});
    const dispL = activeEmi.dimL||ti.dimL||'0';
    const dispW = activeEmi.dimW||ti.dimW||'0';
    const dispH = activeEmi.dimH||ti.dimH||'0';
    const emiCalc = calcEmiShifts({
      dimL:dispL, dimW:dispW, dimH:dispH,
      cables:activeEmi.cables||'0',
      phases:activeEmi.phases||ti.phase||'3'
    });
    const c114 = emiCalc.CS114; // has sigTests, pwrTests, totalTests
    const c116 = emiCalc.CS116;
    const re102p = emiCalc.RE102.pos;
    const rs101p = emiCalc.RS101.pos;
    const rs103p = emiCalc.RS103.pos;
    const pwrCables = sf(activeEmi.phases||ti.phase||'3',3)===1?3:4;
    const pos=(n)=>n+' position'+(n!==1?'s':'');

    // Full 461F test definitions — only show tests selected by user
    const EMI_461F = [
      {key:"CE101", label:"Conducted Emissions, Power Leads, 30 Hz to 10 kHz",
       desc:"Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461F Figure CE101-2, input power < 1 kVA.",
       note:null},
      {key:"CE102", label:"Conducted Emissions, Power Leads, 10 kHz to 10 MHz",
       desc:"Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461F Figure CE102-1 from 10 kHz to 10 MHz with 6 dB relaxation.",
       note:null},
      {key:"CS101", label:"Conducted Susceptibility, Power Leads, 30 Hz to 150 kHz",
       desc:"Tested on each AC high side for a total of one (1) test. Tested to MIL-STD-461F Figure CS101-1, Curve 1 and Figure CS101-2.",
       note:null},
      {key:"CS106", label:"Conducted Susceptibility, Transients, Power Leads",
       desc:"Tested on each AC high side for a total of two (2) tests. Tested to MIL-STD-461F Figure CS106-1. Testing performed with a test generator compliant with CS06. Tested in charged mode of operation only.",
       note:"The overshoot on this generator is slightly higher than specified in CS106 but test results are generally accepted as this is considered worst case."},
      {key:"CS114", label:"Conducted Susceptibility, Bulk Cable Injection, 10 kHz to 200 MHz and 4 kHz to 1 MHz at 77 dB uA",
       desc:"Bulk injection on AC power input lead and on one lead individually. Common mode test on input leads for a total of "+c114.pwrTests+" tests for power leads. "+c114.sigTests+" test(s) on signal leads for a total of "+c114.totalTests+" tests. Tested to MIL-STD-461F Figure CS114-1, Curve 2 from 10 kHz to 200 MHz and from 4 kHz to 1 MHz at 77 dB uA.",
       note:null},
      {key:"CS116", label:"Conducted Susceptibility, Damped Sinusoidal Transients, Cables and Power Leads, 10 kHz to 100 MHz",
       desc:"Bulk injection on AC power input lead and on each lead individually for a total of "+c116.pwrTests+" tests for power leads. "+c116.sigTests+" test(s) on signal leads for a total of "+c116.totalTests+" tests. Tested to MIL-STD-461F Figure CS116-2 at discrete frequencies: 10 kHz, 100 kHz, 1 MHz, 10 MHz, 30 MHz and 100 MHz.",
       note:null},
      {key:"RE101", label:"Radiated Emissions, Magnetic Field, 30 Hz to 100 kHz",
       desc:"Applicable to all enclosures including electrical cable interfaces. Tested to MIL-STD-461F Figure RE101-2 from 30 Hz to 100 kHz.",
       note:null},
      {key:"RE102", label:"Radiated Emissions, Electric Field, 10 kHz to 18 GHz",
       desc:"Tested to MIL-STD-461F Figure RE102-1 for Metallic Ships below deck applications.",
       positions:[
         {range:"10 kHz - 1 GHz",    pos:pos(re102p.sub1GHz)},
         {range:"1 GHz - 4 GHz",     pos:pos(re102p.b1_4)},
         {range:"4 GHz - 15 GHz",    pos:pos(re102p.b4_15)},
         {range:"15 GHz - 18 GHz",   pos:pos(re102p.b15_18)},
       ],
       note:"Tested at width and cables only. Testing required to 10x the highest operating frequency or 1 GHz (whichever is greater), or if not known, to 18 GHz."},
      {key:"RS101", label:"Radiated Susceptibility, Magnetic Field, 30 Hz to 100 kHz",
       desc:"Applicable to all equipment enclosures including electrical cable interfaces. Tested to MIL-STD-461F Figure RS101-1 from 30 Hz to 100 kHz at approximately "+rs101p.total+" positions ("+rs101p.LW+" LxW + "+rs101p.LH+" LxH + "+rs101p.WH+" WxH).",
       note:"Applicability depends on application."},
      {key:"RS103", label:"Radiated Susceptibility, Electric Field, 2 MHz to 18 GHz",
       desc:"Tested to MIL-STD-461F Table VII for Ships metallic below deck from 2 MHz to 18 GHz at 10 V/m.",
       positions:[
         {range:"2 MHz - 30 MHz",    pos:pos(rs103p.b2_30)},
         {range:"30 MHz - 200 MHz",  pos:pos(rs103p.b30_200)},
         {range:"200 MHz - 1 GHz",   pos:pos(rs103p.b200_1G)},
         {range:"1 GHz - 4 GHz",     pos:pos(rs103p.b1_4)},
         {range:"4 GHz - 18 GHz",    pos:pos(rs103p.b4_18)},
       ],
       note:null},
    ];

    // Only show tests selected by user across all active EMI instances
    const selectedKeys=new Set();
    emis.filter(s=>s.on).forEach(s=>{
      Object.entries(s.tests||{}).forEach(([k,v])=>{if(v)selectedKeys.add(k);});
    });
    const activeRows=EMI_461F.filter(r=>selectedKeys.has(r.key));

    if(activeRows.length===0){
      setF('normal',10,MUTED);doc.text('No MIL-STD-461F tests selected.',ML,y);y+=20;
    } else {
      sectionHdr('MIL-STD-461F -- Selected Tests');

      activeRows.forEach((r,idx)=>{
        const WRAP = TW - 20;
        // Set font BEFORE each splitTextToSize so measurements match rendering
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
        const lblLines  = doc.splitTextToSize(r.label, TW-54);
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
        const descLines = r.desc ? doc.splitTextToSize(r.desc, WRAP) : [];
        doc.setFont('helvetica','italic'); doc.setFontSize(7.5);
        const noteLines = r.note ? doc.splitTextToSize('Note: '+r.note, WRAP) : [];
        doc.setFont('helvetica','normal'); doc.setFontSize(8);
        const posRows = r.positions ? r.positions.map(({range,pos})=>({
          rng: doc.splitTextToSize(range+':',120),
          pos: doc.splitTextToSize(pos, TW-160)
        })) : [];
        const posH = posRows.reduce((a,pr)=>a+Math.max(pr.rng.length,pr.pos.length)*12+2,0)+(posRows.length>0?4:0);
        const rowH = lblLines.length*14+8
          + (descLines.length>0 ? descLines.length*12+6 : 0)
          + posH
          + (noteLines.length>0 ? noteLines.length*12+6 : 0)
          + 10;
        checkY(rowH+2);

        // Row background
        doc.setFillColor(...(idx%2===0?[238,244,250]:[230,238,246]));
        doc.rect(ML,y,TW,lblLines.length*14+10,'F');
        doc.setFillColor(255,255,255);
        doc.rect(ML,y+lblLines.length*14+10,TW,rowH-(lblLines.length*14+10),'F');
        let ry = y+13;

        // Key + label
        setF('bold',8.5,BLUE); doc.text(r.key, ML+6, ry);
        setF('bold',8.5,DARK); doc.text(lblLines, ML+52, ry);
        ry += lblLines.length*14+4;

        // Description
        if(descLines.length>0){
          setF('normal',8.5,DARK); doc.text(descLines, ML+10, ry); ry+=descLines.length*12+6;
        }

        // Position table (RE102, RS103)
        if(posRows.length>0){
          posRows.forEach(({rng,pos})=>{
            const h=Math.max(rng.length,pos.length)*12+2;
            setF('normal',8,[80,80,80]); doc.text(rng,ML+14,ry);
            setF('bold',8,DARK); doc.text(pos,ML+145,ry); ry+=h;
          });
          ry+=4;
        }

        // Note
        if(noteLines.length>0){
          setF('italic',7.5,[110,85,40]); doc.text(noteLines, ML+10, ry); ry+=noteLines.length*12+5;
        }

        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.4);
        doc.line(ML,y+rowH,ML+TW,y+rowH);
        y+=rowH;
      });
      y+=8;
    }

    // ── General Notes — force new page ──
    drawFooter();
    doc.addPage();
    y=54;
    sectionHdr('General Notes');
    y+=4;
    const generalNotes=[
      'Pricing is based on customer-supplied information and the assumptions listed herein.',
      'Feasibility of testing will be reviewed upon receipt of a purchase order and/or test procedure approval.',
      'This quote assumes that susceptibility criteria can be determined in less than 3 seconds during real-time operation of the EUT. Customer to supply cables and all peripheral/monitoring equipment and one mode of operation (operating or standby). Susceptibility determination provided by the customer.',
      'Pricing and feasibility may be reevaluated upon completion and review of the NU Laboratories Test Configuration Form.',
      'The number of tests required for each test method and/or the number of test positions listed in this document are estimated values. Exact quantities will be determined and documented in the approved test procedure.',
    ];
    generalNotes.forEach((note,i)=>{
      const w=doc.splitTextToSize(note, TW-22);
      const blockH=w.length*13+10;
      checkY(blockH+4);
      doc.setFillColor(...LIGHT); doc.circle(ML+8,y+5,5,'F');
      setF('bold',8,MUTED); doc.text(String(i+1),ML+8,y+8,{align:'center'});
      setF('normal',9,DARK); doc.text(w, ML+20, y+8);
      y+=blockH;
    });
    y+=4;

    const tp=doc.internal.getNumberOfPages();
    for(let p=1;p<=tp;p++){doc.setPage(p);drawFooter();}
    const fname=(qi.opp||'EMI-461F-Specs')+(qi.rev?' Rev '+qi.rev:'')+'.pdf';
    doc.save(fname);
  };

  const exportEmi461gPDF = () => {
    if(window.jspdf){buildEmi461gPDF();return;}
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => buildEmi461gPDF();
    document.head.appendChild(script);
  };

  const buildEmi461gPDF = () => {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit:"pt",format:"letter"});
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 54, MR = 54, TW = PW - ML - MR;
    const RED=[192,57,43],DARK=[30,30,30],MUTED=[100,100,100],LIGHT=[240,240,240],BLUE=[26,82,118];
    let y = 44;

    const setF=(style,size,color)=>{doc.setFont('helvetica',style);doc.setFontSize(size);doc.setTextColor(...(color||DARK));};
    const checkY=(need)=>{if(y+(need||20)>PH-52){drawFooter();doc.addPage();y=54;}};
    const drawFooter=()=>{
      const p=doc.internal.getCurrentPageInfo().pageNumber;
      setF('normal',8,MUTED);
      doc.text('NU Laboratories, Inc. | '+(qi.opp||''),ML,PH-18);
      doc.text('Page '+p+' | '+(qi.revDate||qi.date||''),PW-MR,PH-18,{align:'right'});
      doc.setDrawColor(...LIGHT);doc.setLineWidth(0.5);doc.line(ML,PH-26,PW-MR,PH-26);
    };
    const sectionHdr=(title)=>{
      checkY(28);y+=8;
      doc.setFillColor(...LIGHT);doc.rect(ML,y-2,TW,18,'F');
      doc.setFillColor(...RED);doc.rect(ML,y-2,3,18,'F');
      setF('bold',9,RED);doc.text(title.toUpperCase(),ML+10,y+10);y+=22;
    };

    // ── Header ──
    try{doc.addImage(NU_LOGO_PDF,'PNG',ML,y,180,40);}
    catch(e){setF('bold',14,RED);doc.text('NU LABORATORIES',ML,y+28);}
    setF('normal',8.5,DARK);
    ['312 Old Allerton Road','Annandale, NJ 08801-3206',
     'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
      .forEach((l,i)=>doc.text(l,PW-MR,y+14+i*11,{align:'right'}));
    y+=54;
    doc.setDrawColor(...RED);doc.setLineWidth(1.5);doc.line(ML,y,PW-MR,y);y+=18;

    // ── Title ──
    setF('bold',13,DARK);doc.text('EMI TESTING',ML,y);
    setF('normal',8.5,MUTED);doc.text('MIL-STD-461G -- Test Specifications',ML,y+13);
    setF('normal',9,MUTED);doc.text('Date: '+(qi.revDate||qi.date||''),PW-MR,y,{align:'right'});
    if(qi.opp){setF('bold',9,DARK);doc.text(qi.opp,PW-MR,y+13,{align:'right'});}
    y+=34;
    doc.setDrawColor(...LIGHT);doc.setLineWidth(0.5);doc.line(ML,y,PW-MR,y);y+=16;

    // ── Test Item ──
    sectionHdr('Test Item');
    const sizeStr=[ti.dimL&&ti.dimL+'"',ti.dimW&&ti.dimW+'"',ti.dimH&&ti.dimH+'"'].filter(Boolean).join(' x ');
    const pwrParts=[ti.volt&&ti.volt+' V '+(ti.pwrType||'AC'),ti.phase&&ti.phase+' Ph',ti.hz&&ti.hz+' Hz',ti.amps&&ti.amps+' A'].filter(Boolean);
    [['Unit',ti.item],['Dimensions',sizeStr],['Weight',ti.wt&&ti.wt+' lbs'],['Power',pwrParts.join(', ')]]
      .filter(r=>r[1]).forEach(([label,value],i)=>{
        doc.setFillColor(...(i%2===0?[255,255,255]:[247,248,250]));
        doc.rect(ML,y-2,TW,16,'F');
        setF('bold',9,MUTED);doc.text(label,ML+8,y+9);
        const valLines=doc.splitTextToSize(String(value),TW-112);
        setF('normal',9,DARK);doc.text(valLines,ML+110,y+9);
        y+=16;
      });
    y+=10;

    // ── Compute positions and test counts from calcEmiShifts ──
    const activeEmi = emis.find(s=>s.on)||(emis[0]||{});
    const dispL = activeEmi.dimL||ti.dimL||'0';
    const dispW = activeEmi.dimW||ti.dimW||'0';
    const dispH = activeEmi.dimH||ti.dimH||'0';
    const emiCalc = calcEmiShifts({
      dimL:dispL, dimW:dispW, dimH:dispH,
      cables:activeEmi.cables||'0',
      phases:activeEmi.phases||ti.phase||'3'
    });
    const c114 = emiCalc.CS114;
    const c116 = emiCalc.CS116;
    const re102p = emiCalc.RE102.pos;
    const rs101p = emiCalc.RS101.pos;
    const rs103p = emiCalc.RS103.pos;
    const pos=(n)=>n+' position'+(n!==1?'s':'');

    // CS115: same cable structure as CS114 but fewer power tests (bulk + high side only = pwrCables)
    const cs115 = emiCalc.CS115;
    const c109  = emiCalc.CS109;

    // Full 461G test definitions
    const EMI_461G = [
      {key:"CE101", label:"Conducted Emissions, Audio Frequency Currents, Power Leads",
       desc:"Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461G Figure CE101-2 from 120 Hz to 10 kHz with a relaxation to the limit determined during testing of 20xLog(fundamental current).",
       note:null},
      {key:"CE102", label:"Conducted Emissions, Radio Frequency Potentials, Power Leads",
       desc:"Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461G Figure CE102-1 from 10 kHz to 10 MHz, basic curve relaxed by 6 dB.",
       note:null},
      {key:"CS101", label:"Conducted Susceptibility, Power Leads, 30 Hz to 150 kHz",
       desc:"Tested on the AC high side for a total of one (1) test. Tested to MIL-STD-461G Figure CS101-1 Curve 1 and Figure CS101-2 from 30 Hz to 150 kHz.",
       note:"Exempt from testing for normal operating current >30 A per phase, or if >30 A per phase with sensitivity worse than 1 uV or operating frequency >150 kHz."},
      {key:"CS109", label:"Conducted Susceptibility, Structure Current",
       desc:"Tested to MIL-STD-461G CS109 requirements.",
       note:"Test not applicable to equipment with an operating sensitivity worse than 1 uV or operating frequency >100 kHz."},
      {key:"CS114", label:"Conducted Susceptibility, Bulk Cable Injection, 10 kHz to 200 MHz and 4 kHz to 1 MHz at 77 dB uA",
       desc:"Bulk injection on AC power input and on the high side of the AC input leads. Common mode test on input leads for a total of "+c114.pwrTests+" tests for power leads. "+c114.sigTests+" test(s) on signal leads for a total of "+c114.totalTests+" tests. Tested to MIL-STD-461G Figure CS114-1, Curve 2 from 10 kHz to 200 MHz and from 4 kHz to 1 MHz at 77 dB uA.",
       note:null},
      {key:"CS115", label:"Conducted Susceptibility, Bulk Cable Injection, Impulse Excitation",
       desc:"Bulk injection on AC power input and on the high side individually for a total of "+cs115.pwrTests+" tests for power leads. "+cs115.sigTests+" test(s) on signal leads for a total of "+cs115.totalTests+" tests. Tested to MIL-STD-461G Figure CS115-1 for one minute using 30 ns pulse at 5 amps, 30 Hz.",
       note:null},
      {key:"CS116", label:"Conducted Susceptibility, Damped Sinusoidal Transients, Cables and Power Leads",
       desc:"Bulk injection on AC power input and on the high side and return individually for a total of "+c116.pwrTests+" tests for power leads. "+c116.sigTests+" test(s) on signal leads for a total of "+c116.totalTests+" tests. Tested at discrete frequencies: 10 kHz, 100 kHz, 1 MHz, 10 MHz, 30 MHz and 100 MHz.",
       note:null},
      {key:"RE101", label:"Radiated Emissions, Magnetic Field, 30 Hz to 100 kHz",
       desc:"Applicable to all enclosures including electrical cable interfaces. Tested to MIL-STD-461G Figure RE101-2 from 30 Hz to 100 kHz.",
       note:null},
      {key:"RE102", label:"Radiated Emissions, Electric Field, 10 kHz to 18 GHz",
       desc:"Tested to MIL-STD-461G Figure RE102-1 for Metallic Ships below deck applications.",
       positions:[
         {range:"10 kHz - 30 MHz",   pos:pos(1)},
         {range:"30 MHz - 200 MHz",  pos:pos(1)},
         {range:"200 MHz - 1 GHz",   pos:pos(re102p.b1_4)},
         {range:"1 GHz - 15 GHz",    pos:pos(re102p.b4_15)},
         {range:"15 GHz - 18 GHz",   pos:pos(re102p.b15_18)},
       ],
       note:"Tested at width and cables only. Testing required to 10x the highest operating frequency or 1 GHz (whichever is greater), or if not known, to 18 GHz."},
      {key:"RS101", label:"Radiated Susceptibility, Magnetic Field, 30 Hz to 100 kHz",
       desc:"Applicable to all equipment enclosures including electrical cable interfaces. Tested to MIL-STD-461G Figure RS101-1 from 30 Hz to 100 kHz at approximately "+rs101p.total+" positions ("+rs101p.LW+" LxW + "+rs101p.LH+" LxH + "+rs101p.WH+" WxH).",
       note:"Applicability depends on application. Test not applicable to equipment with an operating sensitivity worse than 1 uV or operating frequency >100 kHz."},
      {key:"RS103", label:"Radiated Susceptibility, Electric Field, 2 MHz to 18 GHz",
       desc:"Tested to MIL-STD-461G Ships metallic below deck from 2 MHz to 18 GHz at 10 V/m.",
       positions:[
         {range:"2 MHz - 30 MHz",    pos:pos(rs103p.b2_30)},
         {range:"30 MHz - 200 MHz",  pos:pos(rs103p.b30_200)},
         {range:"200 MHz - 1 GHz",   pos:pos(rs103p.b200_1G)},
         {range:"1 GHz - 15 GHz",    pos:pos(rs103p.b1_4)},
         {range:"15 GHz - 18 GHz",   pos:pos(rs103p.b4_18)},
       ],
       note:null},
    ];

    // Only show tests selected by user
    const selectedKeys=new Set();
    emis.filter(s=>s.on).forEach(s=>{
      Object.entries(s.tests||{}).forEach(([k,v])=>{if(v)selectedKeys.add(k);});
    });
    const activeRows=EMI_461G.filter(r=>selectedKeys.has(r.key));

    if(activeRows.length===0){
      setF('normal',10,MUTED);doc.text('No MIL-STD-461G tests selected.',ML,y);y+=20;
    } else {
      sectionHdr('MIL-STD-461G -- Selected Tests');

      activeRows.forEach((r,idx)=>{
        const WRAP = TW - 20;
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
        const lblLines  = doc.splitTextToSize(r.label, TW-54);
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
        const descLines = r.desc ? doc.splitTextToSize(r.desc, WRAP) : [];
        doc.setFont('helvetica','italic'); doc.setFontSize(7.5);
        const noteLines = r.note ? doc.splitTextToSize('Note: '+r.note, WRAP) : [];
        doc.setFont('helvetica','normal'); doc.setFontSize(8);
        const posRows = r.positions ? r.positions.map(({range,pos})=>({
          rng: doc.splitTextToSize(range+':',120),
          pos: doc.splitTextToSize(pos, TW-160)
        })) : [];
        const posH = posRows.reduce((a,pr)=>a+Math.max(pr.rng.length,pr.pos.length)*12+2,0)+(posRows.length>0?4:0);
        const rowH = lblLines.length*14+8
          + (descLines.length>0 ? descLines.length*12+6 : 0)
          + posH
          + (noteLines.length>0 ? noteLines.length*12+6 : 0)
          + 10;
        checkY(rowH+2);

        doc.setFillColor(...(idx%2===0?[238,244,250]:[230,238,246]));
        doc.rect(ML,y,TW,lblLines.length*14+10,'F');
        doc.setFillColor(255,255,255);
        doc.rect(ML,y+lblLines.length*14+10,TW,rowH-(lblLines.length*14+10),'F');
        let ry = y+13;

        setF('bold',8.5,BLUE); doc.text(r.key,ML+6,ry);
        setF('bold',8.5,DARK); doc.text(lblLines,ML+52,ry);
        ry += lblLines.length*14+4;

        if(descLines.length>0){setF('normal',8.5,DARK);doc.text(descLines,ML+10,ry);ry+=descLines.length*12+6;}

        if(posRows.length>0){
          posRows.forEach(({rng,pos})=>{
            const h=Math.max(rng.length,pos.length)*12+2;
            setF('normal',8,[80,80,80]); doc.text(rng,ML+14,ry);
            setF('bold',8,DARK); doc.text(pos,ML+145,ry); ry+=h;
          });
          ry+=4;
        }

        if(noteLines.length>0){setF('italic',7.5,[110,85,40]);doc.text(noteLines,ML+10,ry);ry+=noteLines.length*12+5;}

        doc.setDrawColor(...LIGHT);doc.setLineWidth(0.4);
        doc.line(ML,y+rowH,ML+TW,y+rowH);
        y+=rowH;
      });
      y+=8;
    }

    // ── General Notes — force new page ──
    drawFooter();
    doc.addPage();
    y=54;
    sectionHdr('General Notes');
    y+=4;
    const generalNotes=[
      'Pricing is based on customer-supplied information and the assumptions listed herein.',
      'Feasibility of testing will be reviewed upon receipt of a purchase order and/or test procedure approval.',
      'EMI tested in accordance with MIL-STD-461G for Ships metallic below deck applications. Customer to supply cables and all peripheral and monitoring equipment, one mode of operation (operating or standby). Susceptibility determination provided by customer.',
      'Pricing and feasibility may be reevaluated upon completion and review of the NU Laboratories Test Configuration Form.',
      'The number of tests required for each test method and/or the number of test positions listed in this document are estimated values. Exact quantities will be determined and documented in the approved test procedure.',
    ];
    generalNotes.forEach((note,i)=>{
      const w=doc.splitTextToSize(note, TW-22);
      const blockH=w.length*13+10;
      checkY(blockH+4);
      doc.setFillColor(...LIGHT); doc.circle(ML+8,y+5,5,'F');
      setF('bold',8,MUTED); doc.text(String(i+1),ML+8,y+8,{align:'center'});
      setF('normal',9,DARK); doc.text(w, ML+20, y+8);
      y+=blockH;
    });
    y+=4;

    const tp=doc.internal.getNumberOfPages();
    for(let p=1;p<=tp;p++){doc.setPage(p);drawFooter();}
    const fname=(qi.opp||'EMI-461G-Specs')+(qi.rev?' Rev '+qi.rev:'')+'.pdf';
    doc.save(fname);
  };

  const exportPq300Part1PDF = () => {
    if(window.jspdf){buildPq300Part1PDF();return;}
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => buildPq300Part1PDF();
    document.head.appendChild(script);
  };

  const buildPq300Part1PDF = () => {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit:"pt",format:"letter"});
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 54, MR = 54, TW = PW - ML - MR;
    const RED = [192,57,43], DARK = [30,30,30], MUTED = [100,100,100], LIGHT = [240,240,240], BLUE = [26,82,118];
    let y = 44;
    let pageNum = 1;

    const setF = (style, size, color) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...(color||DARK));
    };
    const checkY = (need) => {
      if(y + (need||20) > PH - 52){
        drawFooter();
        doc.addPage();
        pageNum++;
        y = 54;
      }
    };
    const drawFooter = () => {
      const p = doc.internal.getCurrentPageInfo().pageNumber;
      setF('normal', 8, MUTED);
      doc.text('NU Laboratories, Inc. | '+(qi.opp||''), ML, PH-18);
      doc.text('Page '+p+' | '+(qi.revDate||qi.date||''), PW-MR, PH-18, {align:'right'});
      doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
      doc.line(ML, PH-26, PW-MR, PH-26);
    };
    const sectionHdr = (title) => {
      checkY(28);
      y += 8;
      doc.setFillColor(...LIGHT);
      doc.rect(ML, y-2, TW, 18, 'F');
      doc.setFillColor(...RED); doc.rect(ML, y-2, 3, 18, 'F');
      setF('bold', 9, RED); doc.text(title.toUpperCase(), ML+10, y+10);
      y += 22;
    };

    // ── Header ──
    try { doc.addImage(NU_LOGO_PDF, 'PNG', ML, y, 180, 40); }
    catch(e) { setF('bold', 14, RED); doc.text('NU LABORATORIES', ML, y+28); }
    setF('normal', 8.5, DARK);
    ['312 Old Allerton Road','Annandale, NJ 08801-3206',
     'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
      .forEach((l,i) => doc.text(l, PW-MR, y+14+i*11, {align:'right'}));
    y += 54;
    doc.setDrawColor(...RED); doc.setLineWidth(1.5);
    doc.line(ML, y, PW-MR, y);
    y += 18;

    // ── Title ──
    setF('bold', 13, DARK); doc.text('POWER QUALITY', ML, y);
    setF('normal', 8.5, MUTED); doc.text('MIL-STD-1399 Section 300 Part 1 -- Test Specifications', ML, y+13);
    setF('normal', 9, MUTED); doc.text('Date: '+(qi.revDate||qi.date||''), PW-MR, y, {align:'right'});
    if(qi.opp){ setF('bold',9,DARK); doc.text(qi.opp, PW-MR, y+13, {align:'right'}); }
    y += 34;
    doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
    doc.line(ML, y, PW-MR, y);
    y += 16;

    // ── Test Item ──
    sectionHdr('Test Item');
    const sizeStr = [ti.dimL&&ti.dimL+'"',ti.dimW&&ti.dimW+'"',ti.dimH&&ti.dimH+'"'].filter(Boolean).join(' x ');
    const pwrParts = [ti.volt&&ti.volt+' V '+(ti.pwrType||'AC'),ti.phase&&ti.phase+' Ph',ti.hz&&ti.hz+' Hz',ti.amps&&ti.amps+' A'].filter(Boolean);
    [['Unit',ti.item],['Dimensions',sizeStr],['Weight',ti.wt&&ti.wt+' lbs'],['Power',pwrParts.join(', ')]]
      .filter(r=>r[1]).forEach(([label,value],i)=>{
        doc.setFillColor(...(i%2===0?[255,255,255]:[247,248,250]));
        doc.rect(ML, y-2, TW, 16, 'F');
        setF('bold',9,MUTED); doc.text(label, ML+8, y+9);
        setF('normal',9,DARK); doc.text(String(value), ML+110, y+9);
        y += 16;
      });
    y += 10;

    // ── Part 1 test data ──
    const PQ_P1_FULL = [
      {key:"5.3.1", label:"Grounding (susceptibility) test",
       req:"100,000-ohm; each lead grounded individually for 5 minutes",
       ref:null, note:null},
      {key:"5.3.2", label:"User equipment power profile test",
       req:"User voltage and power characteristics per Section 5.3.2 a. through o. as required",
       ref:null,
       note:"Inrush current measurement may be limited by the capabilities of the AC source used, which may not cover 10x nominal current or higher. If inrush exceeds source capability the measurement cannot be made as desired. Will report what is measured and make a best effort attempt using facility power directly (5 attempts)."},
      {key:"5.3.3", label:"Voltage and frequency maximum departure tolerance test",
       req:"Type 1 single phase (127/104) VAC, (63/57) Hz or Type 1 single phase (484/396) VAC, (63/57) Hz",
       ref:"Table III for shipboard and submarine applications. Tested for 30 minutes in four (4) modes after temperature stability.",
       note:null},
      {key:"5.3.4", label:"Voltage and frequency transient tolerance and recovery test",
       req:"138 VAC / 63.3 Hz; 92 VAC / 56.7 Hz or 528 VAC / 63.3 Hz; 352 VAC / 56.7 Hz",
       ref:"Table IV, duration 2 seconds",
       note:null},
      {key:"5.3.5", label:"Voltage spike (susceptibility) test",
       req:"900 to 1000 V peak line-to-line and line-to-ground, or 2400 to 2500 V peak line-to-line and line-to-ground",
       ref:"Figure 28, 29 or 30",
       note:"Voltage spike impulse wave shape using IEC 61000-4-5 1.2/50 uS open circuit waveform definition. Overshoot may exceed figure. Or voltage spike impulse wave shape of Figure 6 NAVSEA deviation for light fixtures (MIL-DTL-16377 SSL)."},
      {key:"5.3.6", label:"Emergency conditions (susceptibility) test",
       req:"70 ms dropout, 2 minute dropout; voltage and frequency decay for half-load curve; 67.2 Hz for 2 min / 155.25 VAC for 2 min or 594 VAC for 2 min",
       ref:"Figure 9, Table VII",
       note:"Tc time to be provided by supplier, otherwise default times shall be used."},
      {key:"5.3.7", label:"Current waveform (emission) test",
       req:"Per Section 5.3.7, performed in accordance with CE101 testing",
       ref:null,
       note:"Requirement met using MIL-STD-461G test method CE101 with frequency extended to 20 kHz. A non-regulated power source may be needed as regulated source switching produces inconsistent current waveform data. Not required for currents < 1 A per NAVSEA."},
      {key:"5.3.8", label:"Voltage and frequency modulation (susceptibility) test",
       req:"Frequency modulation 0.5%; voltage modulation 2%. Periods of 50 ms, 500 ms, 1 s and 10 s each repeated ten consecutive times",
       ref:"Table VIII",
       note:null},
      {key:"5.3.9", label:"Simulated human body impedance ground current test",
       req:"60 Hz to 700 Hz < 5 mA; 700 Hz to 100 kHz < 70 mA",
       ref:"Figure 33 through Figure 36 depending on source voltage",
       note:null},
      {key:"5.3.10.1", label:"Equipment line-to-ground voltage (susceptibility) test",
       req:"150 VDC (for 115 VAC) or 500 VDC (for 440 VAC) for 60 seconds; resistance to ground > 10 MOhm",
       ref:null, note:null},
      {key:"5.3.10.2", label:"Equipment line-to-ground voltage test (AGD)",
       req:"For 440 V rms EUT: AC source 622.2 V peak, DC source 505 VDC. For 115 V rms EUT: AC source 162.6 V peak, DC source 155 VDC.",
       ref:null,
       note:"AGD is run on one line only per NAVSEA direction. Verify if legacy requirements apply."},
    ];

    // Only rows selected by user across all active PQ instances
    const selectedKeys = new Set();
    pqs.filter(s=>s.on).forEach(s=>{
      PQ_P1_FULL.forEach(r=>{ if(s.rows?.[r.key]) selectedKeys.add(r.key); });
    });
    const activeRows = PQ_P1_FULL.filter(r=>selectedKeys.has(r.key));

    if(activeRows.length===0){
      setF('normal',10,MUTED); doc.text('No MIL-STD-1399 Section 300 Part 1 tests selected.', ML, y); y+=20;
    } else {
      sectionHdr('MIL-STD-1399 Section 300 Part 1 -- Selected Tests');

      activeRows.forEach((r,idx)=>{
        const WRAP = TW - 20;
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
        const hdrLines  = doc.splitTextToSize(r.key+' — '+r.label, WRAP);
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
        const reqLines  = r.req ? doc.splitTextToSize(r.req, WRAP) : [];
        doc.setFont('helvetica','normal'); doc.setFontSize(8);
        const refLines  = r.ref ? doc.splitTextToSize('Tables / Figures: '+r.ref, WRAP) : [];
        doc.setFont('helvetica','italic'); doc.setFontSize(7.5);
        const noteLines = r.note ? doc.splitTextToSize('Note: '+r.note, WRAP) : [];
        const rowH = hdrLines.length*14+8
          + (reqLines.length>0 ? reqLines.length*12+6 : 0)
          + (refLines.length>0 ? refLines.length*11+5 : 0)
          + (noteLines.length>0 ? noteLines.length*12+6 : 0)
          + 10;

        checkY(rowH+2);
        doc.setFillColor(...(idx%2===0?[238,244,250]:[230,238,246]));
        doc.rect(ML, y, TW, hdrLines.length*13+10, 'F');
        doc.setFillColor(255,255,255);
        doc.rect(ML, y+hdrLines.length*13+10, TW, rowH-(hdrLines.length*13+10), 'F');

        let ry=y+12;
        setF('bold',8.5,BLUE); doc.text(hdrLines, ML+8, ry); ry+=hdrLines.length*14+4;
        if(reqLines.length>0){ setF('normal',8.5,DARK); doc.text(reqLines, ML+10, ry); ry+=reqLines.length*12+6; }
        if(refLines.length>0){ setF('normal',8,MUTED); doc.text(refLines, ML+10, ry); ry+=refLines.length*11+5; }
        if(noteLines.length>0){ setF('italic',7.5,[110,85,40]); doc.text(noteLines, ML+10, ry); ry+=noteLines.length*12+5; }

        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.4);
        doc.line(ML, y+rowH, ML+TW, y+rowH);
        y += rowH;
      });
      y += 8;
    }

    // ── General Notes — force new page ──
    drawFooter();
    doc.addPage();
    y=54;
    sectionHdr('General Notes');
    y+=4;
    const generalNotes = [
      'Pricing is based on customer-supplied information and the assumptions listed herein.',
      'Feasibility of testing will be reviewed upon receipt of a purchase order and/or test procedure approval.',
      'The number of tests required for each test method and/or the number of test positions listed in this document are estimated values. Exact quantities will be determined and documented in the approved test procedure.',
    ];
    generalNotes.forEach((note,i)=>{
      const w=doc.splitTextToSize(note, TW-22);
      const blockH=w.length*13+10;
      checkY(blockH+4);
      doc.setFillColor(...LIGHT); doc.circle(ML+8,y+5,5,'F');
      setF('bold',8,MUTED); doc.text(String(i+1),ML+8,y+8,{align:'center'});
      setF('normal',9,DARK); doc.text(w, ML+20, y+8);
      y+=blockH;
    });
    y+=4;

    const fname = (qi.opp||'PQ-300-Part1-Specs')+(qi.rev?' Rev '+qi.rev:'')+'.pdf';
    doc.save(fname);
  };

  const buildPDF = (budgetOnly) => {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit:"pt",format:"letter"});
    const PW = doc.internal.pageSize.getWidth();   // 612
    const PH = doc.internal.pageSize.getHeight();  // 792
    const ML = 54, MR = 54, TW = PW - ML - MR;
    const RED = [192,57,43], DARK = [30,30,30], MUTED = [100,100,100], LIGHT = [240,240,240];
    let y = 44;
    let pageNum = 1;

    // ── helpers ──────────────────────────────────────────────────────────────
    const sf2 = v => { const n = parseFloat(String(v).replace(/,/g,'')); return isNaN(n)?0:n; };
    const money = v => '$'+Math.round(sf2(v)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

    const setF = (style, size, color) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...(color||DARK));
    };

    const totalPages = () => doc.internal.getNumberOfPages();

    const drawFooter = () => {
      const p = doc.internal.getCurrentPageInfo().pageNumber;
      setF('normal', 8, MUTED);
      doc.text('NU Laboratories, Inc. | '+(qi.opp||''), ML, PH-18);
      doc.text('Page '+p+' | '+(qi.revDate||qi.date||''), PW-MR, PH-18, {align:'right'});
      doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
      doc.line(ML, PH-26, PW-MR, PH-26);
    };

    const checkY = (need) => {
      if (y + (need||20) > PH - 52) {
        drawFooter();
        doc.addPage();
        pageNum++;
        y = 54;
      }
    };

    // Left-column bold label, right-column normal value
    const kvRow = (label, value) => {
      if (!value && value !== 0) return;
      checkY(16);
      setF('bold', 9.5, DARK);
      doc.text(String(label), ML, y);
      setF('normal', 9.5, DARK);
      const vlines = doc.splitTextToSize(String(value), TW - 120);
      doc.text(vlines, ML + 120, y);
      y += Math.max(14, vlines.length * 13);
    };

    // Red left-border section heading in a light gray band
    const sectionHdr = (title) => {
      checkY(30);
      y += 10;
      doc.setFillColor(...LIGHT);
      doc.rect(ML, y - 10, TW, 20, 'F');
      doc.setFillColor(...RED);
      doc.rect(ML, y - 10, 3, 20, 'F');
      setF('bold', 9, RED);
      doc.text(title.toUpperCase(), ML + 10, y + 4);
      y += 16;
    };

    // ── PAGE 1 ──────────────────────────────────────────────────────────────

    if(!budgetOnly) {
    // Logo
    try { doc.addImage(NU_LOGO_PDF, 'PNG', ML, y, 180, 40); }
    catch(e) { setF('bold', 14, RED); doc.text('NU LABORATORIES', ML, y+28); }

    // Address block top-right
    setF('normal', 8.5, DARK);
    ['312 Old Allerton Road','Annandale, NJ 08801-3206',
     'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
      .forEach((l,i) => doc.text(l, PW-MR, y+14+i*11, {align:'right'}));
    y += 54;

    // Red rule under header
    doc.setDrawColor(...RED); doc.setLineWidth(1.5);
    doc.line(ML, y, PW-MR, y);
    y += 16;

    // Quote # and date
    setF('bold', 16, DARK);
    doc.text('Quote #'+(qi.opp||'')+(qi.rev||''), ML, y);
    setF('normal', 10, MUTED);
    doc.text('Date: '+(qi.revDate||qi.date||''), PW-MR, y, {align:'right'});
    y += 24;

    if(true) {
      // ── QUOTE INFORMATION ────────────────────────────────────────────────
      sectionHdr('Quote Information');
      y += 4;
      [['Opportunity', qi.opp],
       ['Stage', qi.stage],
       ['Type', qi.type],
       ['Quote Revision', qi.rev],
       ['Revision Date', qi.revDate||qi.date],
       qi.account&&['Account', qi.account],
       qi.contact&&['Contact', qi.contact],
       qi.rfq&&['RFQ', qi.rfq],
      ].filter(Boolean).filter(r=>r[1]).forEach(([l,v])=>kvRow(l,v));
      y += 6;

      // ── TEST ITEM DESCRIPTION ────────────────────────────────────────────
      sectionHdr('Test Item Description');
      y += 4;
      const sizeStr=[ti.dimL&&ti.dimL+'"',ti.dimW&&ti.dimW+'"',ti.dimH&&ti.dimH+'"'].filter(Boolean).join(' x ');
      const pwrParts=[ti.volt&&ti.volt+' V '+(ti.pwrType||'AC'),ti.phase&&ti.phase+' Ph',ti.hz&&ti.hz+' Hz',ti.amps&&ti.amps+' A'].filter(Boolean);
      [
        ti.item&&['Test Item', ti.item],
        ti.qty&&ti.qty!=='1'&&['Qty', ti.qty],
        ti.model&&['Model No.', ti.model],
        ti.drawing&&['Drawing No.', ti.drawing],
        sizeStr&&['Size', sizeStr],
        ti.wt&&['Weight', ti.wt+' lbs'],
        pwrParts.length&&['Power', pwrParts.join(', ')],
        (ti.loads||(qi.account&&'All electrical and/or resistive loads will be provided by '+qi.account+' unless otherwise discussed.'))&&['Loads', ti.loads||(qi.account?'All electrical and/or resistive loads will be provided by '+qi.account+' unless otherwise discussed.':'')],
        ti.mounting&&['Mounting', ti.mounting],
        ti.pressureFlow&&['Pressure/Flow', ti.pressureFlow],
      ].filter(Boolean).filter(r=>r[1]).forEach(([l,v])=>kvRow(l,v));

      // GSI bar — always 2 rows: row1: GSI | Witness  row2: Doc Restriction | DPAS
      checkY(42);
      y += 6;
      doc.setFillColor(232,236,240);
      doc.rect(ML, y-2, TW, 30, 'F');
      setF('bold', 9, DARK);
      const gsiHalf = TW / 2;
      doc.text('GSI: '+(ti.gsi||'Unknown'), ML+6, y+10);
      doc.text('Customer Witness: '+(ti.witness||'Unknown'), ML+gsiHalf+6, y+10);
      doc.text('Document Restriction: '+(ti.docRestriction||'None'), ML+6, y+22);
      doc.text('DPAS: '+(ti.dpas||'None'), ML+gsiHalf+6, y+22);
      y += 34;

      // ── SPECIFICATIONS & NOTES ───────────────────────────────────────────
      const specsText = (ti.tiSpecs||autoSpecs||'').trim();
      const notesText = (ti.tiNotes||autoNotes||'').trim();
      if(specsText||notesText){
        sectionHdr('Specifications & Notes');
        y += 4;
        if(specsText){
          setF('bold', 9.5, DARK); checkY(14); doc.text('Specifications:', ML, y); y += 13;
          setF('normal', 9, DARK);
          specsText.split('\n').forEach(line=>{
            if(!line.trim()){y+=4;return;}
            const bullet = line.startsWith('•') ? '' : '';
            const w = doc.splitTextToSize('• '+line.replace(/^•s*/,''), TW-14);
            checkY(w.length*12+3);
            doc.text(w, ML+8, y); y += w.length*12+3;
          });
          y += 4;
        }
        if(notesText){
          setF('bold', 9.5, DARK); checkY(14); doc.text('Notes:', ML, y); y += 13;
          setF('normal', 9, DARK);
          notesText.split('\n').forEach(line=>{
            if(!line.trim()){y+=4;return;}
            const isSubBullet = line.startsWith('  ') || line.startsWith('\t');
            const indent = isSubBullet ? 20 : 8;
            const w = doc.splitTextToSize('• '+line.replace(/^•s*/,'').replace(/^\s+/,''), TW-indent-6);
            checkY(w.length*12+3);
            doc.text(w, ML+indent, y); y += w.length*12+3;
          });
          y += 4;
        }
        y += 4;
      }

      // ── Intro paragraph ───────────────────────────────────────────────────
      checkY(44);
      y += 4;
      setF('normal', 9, DARK);
      const intro = 'Pursuant to your request, we are pleased to offer the following quotation. All pricing is subject to the attached terms and conditions. Any additional terms and conditions must be clearly defined in writing and may be subject to negotiation. This quote is based on the following:';
      const iw = doc.splitTextToSize(intro, TW);
      checkY(iw.length*12+8);
      doc.text(iw, ML, y); y += iw.length*12+12;

      // ── PRICING SUMMARY ───────────────────────────────────────────────────
      sectionHdr('Pricing Summary');
      y += 4;

      // Table header row
      const cQty=28, cCode=36, cAmt=90, cDesc=TW-cQty-cCode-cAmt;
      doc.setFillColor(50,50,50);
      doc.rect(ML, y, TW, 16, 'F');
      setF('bold', 8.5, [255,255,255]);
      doc.text('Qty', ML+cQty/2, y+11, {align:'center'});
      doc.text('Code', ML+cQty+4, y+11);
      doc.text('Description', ML+cQty+cCode+4, y+11);
      doc.text('Amount', PW-MR-4, y+11, {align:'right'});
      y += 16;

      const drawTblHdr = () => {
        doc.setFillColor(50,50,50);
        doc.rect(ML, y, TW, 16, 'F');
        setF('bold', 8.5, [255,255,255]);
        doc.text('Qty', ML+cQty/2, y+11, {align:'center'});
        doc.text('Code', ML+cQty+4, y+11);
        doc.text('Description', ML+cQty+cCode+4, y+11);
        doc.text('Amount', PW-MR-4, y+11, {align:'right'});
        y += 16;
      };

      const order = lineOrder&&lineOrder.length===summary.lines.length ? lineOrder : summary.lines.map((_,i)=>i);
      order.forEach((origIdx, dispIdx) => {
        const l = summary.lines[origIdx];
        const ov = lineOverrides[origIdx]||{};
        if(ov.deleted) return;
        const price = ov.price!==undefined ? sf2(ov.price) : l.val;
        const desc = ov.desc&&ov.desc.trim() ? ov.desc.trim() : null;
        const rowH = desc ? 26 : 14;
        if(y + rowH + 2 > PH-52){ drawFooter(); doc.addPage(); pageNum++; y=54; drawTblHdr(); }
        const bg = dispIdx%2===0 ? [255,255,255] : [247,248,250];
        doc.setFillColor(...bg); doc.rect(ML, y, TW, rowH, 'F');
        setF('normal', 9, DARK);
        doc.text('1', ML+cQty/2, y+10, {align:'center'});
        if(l.code){ setF('normal',8,MUTED); doc.text(String(l.code), ML+cQty+4, y+10); }
        setF('normal', 9, DARK); doc.text(l.label, ML+cQty+cCode+4, y+10);
        if(desc){
          setF('italic', 7.5, [130,130,130]);
          const dw = doc.splitTextToSize(desc, cDesc-10);
          doc.text(dw, ML+cQty+cCode+4, y+19);
        }
        setF('bold', 9, DARK); doc.text(money(price), PW-MR-4, y+10, {align:'right'});
        y += rowH;
      });

      // Total row
      checkY(28);
      y += 4;
      doc.setDrawColor(...RED); doc.setLineWidth(1); doc.line(ML, y, PW-MR, y); y += 1;
      doc.setFillColor(245,245,245); doc.rect(ML, y, TW, 20, 'F');
      setF('bold', 11, DARK);
      doc.text('TOTAL', ML+cQty+cCode+4, y+14);
      const total = summary.lines.reduce((a,l,idx)=>{
        const ov=lineOverrides[idx]||{};
        if(ov.deleted)return a;
        return a+(ov.price!==undefined?sf2(ov.price):l.val);
      },0);
      setF('bold', 11, DARK);
      doc.text(money(total), PW-MR-4, y+14, {align:'right'});
      y += 26;

      // ── TERMS & CONDITIONS — force new page ──────────────────────────────
      drawFooter();
      doc.addPage();
      y = 54;

      // T&C header bar
      doc.setFillColor(...RED); doc.rect(ML,y-2,TW,24,'F');
      setF('bold',13,[255,255,255]); doc.text('NOTES',ML+10,y+13); y+=32;

      const TERMS = [
        "All work to be performed during normal business hours unless specifically noted on this quote.",
        "Customer is to supply all installation hardware, cables, hoses, mating connections for power or fluid, electrical/resistive and dummy loads, and specialized monitoring equipment/peripheral equipment unless other arrangements with NU Laboratories, Inc. have been made. No functional testing shall be performed by NU Laboratories or its personnel unless specifically addressed in our quotation.",
        "All equipment, including the UUT, support equipment, test fixtures, mounting brackets, etc. are to be delivered to NU Laboratories no later than (5) business days prior to the scheduled testing start date.",
        "Return shipping arrangements are to be provided prior to the start of testing. If not, storage charges will apply beginning (5) business days after testing is completed.",
        "If applicable, all import and export documentation is to be provided by the customer.",
        "Out-of-scope work, including additional efforts and standby charges are to be determined at NU Laboratories' discretion and will be quoted separately.",
        "This quote does not guarantee a specific testing schedule, nor does it represent a fixed number of testing days. Scheduling will be secured with the receipt of a purchase order and/or test procedure approval.",
        "Testing duration may be affected by factors such as equipment malfunctions or failures, delays in the delivery of customer-supplied equipment, or other unforeseen issues. Such circumstances may result in additional charges.",
        "Delays caused by NU Laboratories--including, but not limited to, the unavailability of test equipment or personnel--will not result in charges to the customer. However, such delays will not entitle the customer to any discounts, refunds, or price reductions.",
        "The provided quote is based on a pass scenario and does not account for any additional time required due to test item malfunctions or failures. Should the customer's representative request a retest or engineering evaluation, a separate quote will be issued.",
        "Any requested lead times are estimated and may be subject to change.",
        "This quote is based on a total purchase and is good for a period of 90 days.",
        "All mounting hardware is assumed to be supplied by the customer. If NU Laboratories is asked to supply mounting hardware, it is assumed to be SAE Grade 5. Any other material hardware will be quoted separately and specifically noted within the quote. If no notes pertaining to the type of hardware are present on the quote, the quote reflects Grade 5 hardware. All fixturing provided by NU Laboratories is assumed to be A36 Steel. All other hardware and fixture requirements will be quoted separately if not detailed in this quote.",
      ];
      TERMS.forEach((t,i) => {
        const w = doc.splitTextToSize(t, TW-20);
        const blockH = w.length*11+5;
        checkY(blockH+3);
        doc.setFillColor(...LIGHT); doc.circle(ML+7, y+3, 5, 'F');
        setF('bold',7,MUTED); doc.text(String(i+1), ML+7, y+6, {align:'center'});
        setF('normal', 8, DARK); doc.text(w, ML+18, y+6);
        y += blockH;
      });
      y += 10;

      // ── GOVERNMENT SOURCE INSPECTION ─────────────────────────────────────
      checkY(70);
      doc.setFillColor(...LIGHT); doc.rect(ML,y-2,TW,18,'F');
      doc.setFillColor(...RED); doc.rect(ML,y-2,3,18,'F');
      setF('bold',9,RED); doc.text('GOVERNMENT SOURCE INSPECTION',ML+10,y+10); y+=22;
      setF('normal', 9, DARK);
      doc.text('If Government Source Inspection is required:', ML, y); y += 14;
      [['Navy Nuclear','Michael Auchenbach -- michael.a.auchenbach.civ@mail.mil -- T: 908-387-9866  F: 908-387-8694'],
       ['Non-Nuclear','Tyson Rounsaville, QAR -- tyson.rounsaville.civ@mail.mil -- T: 973-891-3850  F: 973-446-4236'],
      ].forEach(([k,v]) => {
        checkY(18);
        setF('bold',9,DARK); const kw=doc.getTextWidth('* '+k+': ');
        doc.text('* '+k+': ', ML+4, y);
        setF('normal',9,DARK);
        const vw=doc.splitTextToSize(v, TW-kw-10);
        doc.text(vw, ML+4+kw, y); y += vw.length*12+6;
      });
      y += 12;

      // ── Closing paragraphs ───────────────────────────────────────────────
      const closingParas = [
        'This is a line item quote. Please have your purchase order reflect each line item and our quote number. Please send the signed Terms and Conditions page and Purchase Orders to Fax: 908-713-9001 or e-mail: sales@nulabs.com, attention Jordan McAdoo.',
        'We appreciate this opportunity to quote on your testing requirements. In the event that we receive a purchase order for the above testing, please acknowledge the enclosed terms and conditions and return with your order. Should you have further questions, please feel free to contact us.',
      ];
      setF('normal', 9, DARK);
      closingParas.forEach(t => {
        const w = doc.splitTextToSize(t, TW);
        checkY(w.length*12+10);
        doc.text(w, ML, y); y += w.length*12+10;
      });

      // ── Signature block ──────────────────────────────────────────────────
      checkY(90); y += 16;
      setF('normal', 8.5, MUTED); doc.text('Submitted by:', ML, y); y += 6;
      // Real signature image — aspect ratio ~1330/630 ≈ 2.1:1, render at 140pt wide
      try { doc.addImage(JORDAN_SIG_PDF,'PNG',ML,y,140,66); }
      catch(e) { setF('italic',18,DARK); doc.text('Jordan McAdoo',ML,y+40); }
      y += 70;
      setF('bold', 9, DARK); doc.text('Jordan McAdoo', ML, y); y += 13;
      setF('normal', 8.5, MUTED); doc.text('Sales Manager, NU Laboratories, Inc.', ML, y);

    }} // end if(!budgetOnly)

    // ── BUDGET PDF ────────────────────────────────────────────────────────
    if(budgetOnly&&budget.on&&budget.rows.length>0){
      // Logo
      try { doc.addImage(NU_LOGO_PDF, 'PNG', ML, y, 180, 40); }
      catch(e) { setF('bold', 14, RED); doc.text('NU LABORATORIES', ML, y+28); }
      // Address top-right
      setF('normal', 8.5, DARK);
      ['312 Old Allerton Road','Annandale, NJ 08801-3206',
       'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
        .forEach((l,i) => doc.text(l, PW-MR, y+14+i*11, {align:'right'}));
      y += 54;
      doc.setDrawColor(...RED); doc.setLineWidth(1.5);
      doc.line(ML, y, PW-MR, y);
      y += 16;
      // Title
      setF('bold', 16, RED); doc.text('BUDGET MATERIALS', ML, y); y += 4;
      setF('normal', 9, MUTED); doc.text('Date: '+(qi.revDate||qi.date||''), PW-MR, y-10, {align:'right'});
      if(qi.opp){ setF('normal',9,DARK); doc.text('Opportunity: ',ML,y+6); setF('bold',9,DARK); doc.text(qi.opp,ML+55,y+6); y+=20; }
      else{ y+=14; }
      // Internal notes
      const bNotes=(budget.notes||'').trim();
      if(bNotes){
        checkY(20); setF('bold',8.5,DARK); doc.text('Internal Notes:',ML,y); y+=11;
        setF('normal',8.5,[80,80,80]);
        bNotes.split('\n').forEach(line=>{if(!line.trim()){y+=4;return;}const w=doc.splitTextToSize(line,TW-6);checkY(w.length*11+2);doc.text(w,ML+4,y);y+=w.length*11+2;});
        y+=8;
      }
      y += 6;
      const mp=sf2(budget.markup||25)/100;
      const hardTot=budget.rows.reduce((s,r)=>s+sf2(r.qty||1)*sf2(r.unitCost||0),0);
      doc.setFillColor(50,50,50); doc.rect(ML,y,TW,16,'F');
      setF('bold',8.5,[255,255,255]);
      const bDesc=TW*0.44,bQty=TW*0.08,bUC=TW*0.16,bHC=TW*0.16,bMU=TW*0.16;
      let bx=ML;
      doc.text('Part / Description',bx+4,y+11);bx+=bDesc;
      doc.text('Qty',bx+bQty/2,y+11,{align:'center'});bx+=bQty;
      doc.text('Unit Cost',bx+4,y+11);bx+=bUC;
      doc.text('Hard Cost',bx+4,y+11);bx+=bHC;
      doc.text('w/ Markup',bx+4,y+11);
      y+=16;
      budget.rows.forEach((r,idx)=>{
        checkY(14);
        doc.setFillColor(...(idx%2===0?[255,255,255]:[247,248,250]));
        doc.rect(ML,y,TW,14,'F');
        setF('normal',8.5,DARK);
        bx=ML;
        const hardCost=sf2(r.qty||1)*sf2(r.unitCost||0);
        const markedUp=Math.round(hardCost*(1+mp));
        const dw=doc.splitTextToSize(r.desc||'',bDesc-8);
        doc.text(dw,bx+4,y+10);bx+=bDesc;
        doc.text(String(r.qty||'1'),bx+bQty/2,y+10,{align:'center'});bx+=bQty;
        doc.text('$'+sf2(r.unitCost||0).toLocaleString(),bx+4,y+10);bx+=bUC;
        setF('bold',8.5,DARK);doc.text('$'+Math.round(hardCost).toLocaleString(),bx+4,y+10);bx+=bHC;
        setF('bold',8.5,RED);doc.text('$'+markedUp.toLocaleString(),bx+4,y+10);
        y+=Math.max(14,dw.length*11+3);
      });
      checkY(18);
      doc.setFillColor(232,236,240);doc.rect(ML,y,TW,16,'F');
      doc.setDrawColor(...RED);doc.setLineWidth(0.5);doc.line(ML,y,PW-MR,y);
      setF('bold',8.5,DARK);
      bx=ML+bDesc+bQty;
      doc.text('Markup: '+Math.round(sf2(budget.markup||25))+'%',bx+4,y+11);
      bx+=bUC;
      doc.text('$'+Math.round(hardTot).toLocaleString(),bx+4,y+11);
      bx+=bHC;
      setF('bold',8.5,RED);doc.text('$'+Math.round(hardTot*(1+mp)).toLocaleString(),bx+4,y+11);
      y+=22;
    }

    // footers on all pages
    const tp = doc.internal.getNumberOfPages();
    for(let p=1;p<=tp;p++){ doc.setPage(p); drawFooter(); }

    const fname=(qi.opp||'Quote')+(qi.rev?' Rev '+qi.rev:'')+(budgetOnly?' Budget':'')+'.pdf';
    doc.save(fname);
  };


  return(
    <div style={{height:"100vh",background:C.bg,fontFamily:"Segoe UI,system-ui,sans-serif",color:C.text,display:"flex",flexDirection:"column",fontSize:13}}>

      {/* ── Header ── */}
      <div style={{background:C.accent,padding:"9px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0,boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>
        <div style={{background:"#fff",borderRadius:20,padding:"4px 12px",display:"flex",alignItems:"center",justifyContent:"center",height:36}}>
                  <img src="data:image/png;base64,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" alt="NU Laboratories" style={{height:28,width:"auto",objectFit:"contain"}}/>
                </div>
        <div style={{fontWeight:700,fontSize:13,letterSpacing:1,color:"rgba(255,255,255,0.5)",marginLeft:4}}>VIBRATO</div>
        <div style={{flex:1}}/>
        <QuoteSearch onLoad={handleLoad}/>
        {/* Approval status badge */}
        {approval.status!="none"&&(
          <div style={{display:"flex",alignItems:"center",gap:6,borderRadius:7,padding:"5px 12px",fontWeight:700,fontSize:11,letterSpacing:.5,
            background:approval.status==="pending"?"#b7791f":approval.status==="approved"?"#1e8449":"#c0392b",color:"#fff"}}>
            {approval.status==="pending"&&"⏳ PENDING APPROVAL"}
            {approval.status==="approved"&&"✅ APPROVED"}
            {approval.status==="rejected"&&"❌ REJECTED"}
          </div>
        )}
        <button onClick={handleNewQuote}
          title="Start a fresh blank quote"
          style={{background:"#2d6a4f",border:"none",borderRadius:7,padding:"7px 14px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:.5}}>
          + NEW
        </button>
        <button onClick={handleClone}
          title="Clone this quote — clears opportunity fields, keeps all test details"
          style={{background:"#2e6da4",border:"none",borderRadius:7,padding:"7px 14px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:.5}}>
          CLONE
        </button>
        <button onClick={handleSave}
          style={{background:C.red,border:"none",borderRadius:7,padding:"7px 16px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:.5}}>
          SAVE
        </button>

        {/* Submit for Approval — shown to all users when not already pending/approved */}
        {approval.status==="none"||approval.status==="rejected"?(
          <button onClick={()=>setShowApprovalModal(true)}
            style={{background:"#6d28d9",border:"none",borderRadius:7,padding:"7px 14px",
              color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:.5}}>
            📋 SUBMIT
          </button>
        ):null}
        {/* Approver action buttons — shown only to approvers when pending */}
        {isApprover&&approval.status==="pending"&&(
          <>
            <button onClick={handleApproverUnlock}
              title="Unlock to make changes, then approve"
              style={{background:"#b7791f",border:"none",borderRadius:7,padding:"7px 12px",
                color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:.5}}>
              ✏️ EDIT
            </button>
            <button onClick={handleApprove}
              style={{background:"#1e8449",border:"none",borderRadius:7,padding:"7px 12px",
                color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:.5}}>
              ✅ APPROVE
            </button>
            <button onClick={handleReject}
              style={{background:"#c0392b",border:"none",borderRadius:7,padding:"7px 12px",
                color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:.5}}>
              ❌ REJECT
            </button>
          </>
        )}
        <button onClick={()=>setLocked(l=>!l)}
          title={locked?"Unlock form to edit":"Lock form to prevent edits"}
          style={{background:locked?"#b7791f":"#2d6a4f",border:"none",borderRadius:7,padding:"7px 14px",
            color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:.5,display:"flex",alignItems:"center",gap:6}}>
          {locked?"🔒 LOCKED":"🔓 UNLOCKED"}
        </button>
        {anyOn&&<div style={{fontSize:14,color:"#fff",fontWeight:700,fontFamily:"monospace",marginLeft:4}}>{money(summary.total)}</div>}
        {currentUser&&<div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginLeft:8}}>{currentUser}</div>}
        {currentQuoteId&&<button onClick={handleDeleteQuote}
          title="Delete this quote from the repository"
          style={{background:"none",border:"1px solid rgba(255,100,100,0.4)",borderRadius:6,padding:"5px 10px",
            color:"rgba(255,160,160,0.8)",fontSize:11,cursor:"pointer",marginLeft:4}}>
          🗑 Delete
        </button>}
        {onLogout&&<button onClick={onLogout}
          style={{background:"none",border:"1px solid rgba(255,255,255,0.25)",borderRadius:6,padding:"5px 10px",
            color:"rgba(255,255,255,0.6)",fontSize:11,cursor:"pointer",marginLeft:4}}>
          Sign out
        </button>}
      </div>

      {/* ── Body: left scroll + right sticky summary ── */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ── Left: scrollable form column ── */}
        <div style={{flex:1,overflowY:"auto",background:C.bg,padding:14}}>

          {/* ── Approval submission modal ── */}
          {showApprovalModal&&(
            <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}
              onClick={e=>{if(e.target===e.currentTarget)setShowApprovalModal(false);}}>
              <div style={{background:"#fff",borderRadius:14,padding:28,width:440,boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
                <div style={{fontWeight:700,fontSize:15,color:"#1a2332",marginBottom:6}}>Submit Quote for Approval</div>
                <div style={{fontSize:12,color:"#6b7a8d",marginBottom:16,lineHeight:1.6}}>
                  This will <b>lock the quote</b> and notify the approvers. They will be able to approve, reject, or make changes before approving.
                </div>
                <div style={{background:"#f0f2f5",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12}}>
                  <div style={{color:"#6b7a8d",marginBottom:4,fontWeight:600}}>QUOTE DETAILS</div>
                  <div><b>Opportunity:</b> {qi.opp||"(none)"}</div>
                  <div><b>RFQ:</b> {qi.rfq||"(none)"}</div>
                  <div><b>Total:</b> {money(summary.total)}</div>
                  <div style={{marginTop:6,color:"#6b7a8d",fontSize:11}}>Notifying: Jordan McAdoo, Ragen McAdoo, Russ McAdoo</div>
                </div>
                <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                  <button onClick={()=>setShowApprovalModal(false)}
                    style={{background:"#e8ecf0",border:"none",borderRadius:7,padding:"8px 18px",fontWeight:600,fontSize:12,cursor:"pointer",color:"#1a2332"}}>
                    Cancel
                  </button>
                  <button onClick={handleSubmitApproval}
                    style={{background:"#6d28d9",border:"none",borderRadius:7,padding:"8px 20px",fontWeight:700,fontSize:12,cursor:"pointer",color:"#fff"}}>
                    Submit for Approval
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* ── Clone modal — enter new opportunity # ── */}
          {showCloneModal&&(
            <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}
              onClick={e=>{if(e.target===e.currentTarget){setShowCloneModal(false);setCloneOppInput("");}}}>
              <div style={{background:"#fff",borderRadius:14,padding:28,width:380,boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
                <div style={{fontWeight:700,fontSize:15,color:"#1a2332",marginBottom:6}}>Clone Quote</div>
                <div style={{fontSize:12,color:"#6b7a8d",marginBottom:16,lineHeight:1.6}}>
                  All test details will be copied. Enter the new opportunity number to continue.
                </div>
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:9,color:"#6b7a8d",fontWeight:700,marginBottom:4}}>NEW OPPORTUNITY #</div>
                  <input
                    autoFocus
                    value={cloneOppInput}
                    onChange={e=>setCloneOppInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")doClone(cloneOppInput);}}
                    placeholder="e.g. 2025-0042"
                    style={{width:"100%",fontSize:13,borderRadius:7,border:"1px solid #d0d7de",padding:"8px 10px",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                </div>
                <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                  <button onClick={()=>{setShowCloneModal(false);setCloneOppInput("");}}
                    style={{background:"#e8ecf0",border:"none",borderRadius:7,padding:"8px 18px",fontWeight:600,fontSize:12,cursor:"pointer",color:"#1a2332"}}>
                    Cancel
                  </button>
                  <button onClick={()=>doClone(cloneOppInput)}
                    style={{background:"#2e6da4",border:"none",borderRadius:7,padding:"8px 20px",fontWeight:700,fontSize:12,cursor:"pointer",color:"#fff"}}>
                    Clone
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* ── Won Details modal ── */}
          {showWonModal&&(
            <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}
              onClick={e=>{if(e.target===e.currentTarget)setShowWonModal(false);}}>
              <div style={{background:"#fff",borderRadius:14,padding:28,width:380,boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:18}}>🏆</span>
                    <div style={{fontWeight:700,fontSize:15,color:"#145a32"}}>Closed Won Details</div>
                  </div>
                  <button onClick={()=>setWonLocked(l=>!l)}
                    title={wonLocked?"Unlock to edit":"Lock to prevent changes"}
                    style={{background:wonLocked?"#b7791f":"#2d6a4f",border:"none",borderRadius:6,
                      padding:"4px 10px",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                    {wonLocked?"🔒 Locked":"🔓 Unlocked"}
                  </button>
                </div>
                <div style={{fontSize:11,color:"#6b7a8d",marginBottom:18,lineHeight:1.5}}>
                  Internal use only — this information is not included in the quote PDF.
                </div>
                {wonLocked&&(
                  <div style={{background:"rgba(183,121,31,0.1)",border:"1px solid #b7791f",borderRadius:7,
                    padding:"7px 12px",marginBottom:14,fontSize:11,color:"#7b4f12",fontWeight:600}}>
                    🔒 Fields are locked — click Unlocked to make changes
                  </div>
                )}
                {[
                  ["Won Date","wonDate","e.g. 3/18/2026"],
                  ["Job #","jobNum","e.g. J-2025-042"],
                  ["PO #","poNum","e.g. PO-98765"],
                ].map(([label,key,placeholder])=>(
                  <div key={key} style={{marginBottom:14}}>
                    <div style={{fontSize:9,color:"#6b7a8d",fontWeight:700,marginBottom:4}}>{label}</div>
                    <input
                      value={wonInfo[key]||""}
                      onChange={e=>!wonLocked&&setWonInfo({...wonInfo,[key]:e.target.value})}
                      readOnly={wonLocked}
                      placeholder={placeholder}
                      style={{width:"100%",fontSize:12,borderRadius:7,border:"1px solid #d0d7de",padding:"7px 10px",
                        outline:"none",fontFamily:"inherit",boxSizing:"border-box",
                        background:wonLocked?"#f0f2f5":"#fff",color:wonLocked?"#6b7a8d":"#1a2332",
                        cursor:wonLocked?"not-allowed":"text"}}/>
                  </div>
                ))}
                <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:6}}>
                  <button onClick={()=>setShowWonModal(false)}
                    style={{background:"#1e8449",border:"none",borderRadius:7,padding:"8px 22px",fontWeight:700,fontSize:12,cursor:"pointer",color:"#fff"}}>
                    Save &amp; Close
                  </button>
                </div>
              </div>
            </div>
          )}
          {isApprover&&approval.status==="pending"&&(
            <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(109,40,217,0.08)",
              border:"1px solid #6d28d9",borderRadius:8,padding:"10px 14px",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:15}}>📋</span>
                <span style={{fontSize:12,color:"#4c1d95",fontWeight:700}}>
                  Pending Approval — submitted by {approval.submittedBy} on {approval.submittedAt?new Date(approval.submittedAt).toLocaleDateString():""} 
                </span>
              </div>
              <div style={{fontSize:11,color:"#6b7a8d",marginBottom:6}}>
                Add comments (optional) before approving or rejecting:
              </div>
              <textarea value={approvalComments} onChange={e=>setApprovalComments(e.target.value)}
                placeholder="Comments for the submitter..."
                rows={2}
                style={{width:"100%",fontSize:11,borderRadius:6,border:"1px solid #d0d7de",padding:"6px 8px",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>
            </div>
          )}
          {/* ── Approval result banner ── */}
          {approval.status==="approved"&&(
            <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(30,132,73,0.1)",
              border:"1px solid #1e8449",borderRadius:8,padding:"8px 14px",marginBottom:10,
              display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>✅</span>
              <span style={{fontSize:12,color:"#145a32",fontWeight:600}}>
                Approved by {approval.decidedBy} on {approval.decidedAt?new Date(approval.decidedAt).toLocaleDateString():""}
                {approval.comments&&" — "+approval.comments}
              </span>
            </div>
          )}
          {approval.status==="rejected"&&(
            <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(192,57,43,0.08)",
              border:"1px solid #c0392b",borderRadius:8,padding:"8px 14px",marginBottom:10,
              display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>❌</span>
              <span style={{fontSize:12,color:"#922b21",fontWeight:600}}>
                Rejected by {approval.decidedBy} on {approval.decidedAt?new Date(approval.decidedAt).toLocaleDateString():""}
                {approval.comments&&" — "+approval.comments}
              </span>
            </div>
          )}
          {locked&&approval.status==="none"&&(
            <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(183,121,31,0.12)",
              border:"1px solid #b7791f",borderRadius:8,padding:"8px 14px",marginBottom:10,
              display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>🔒</span>
              <span style={{fontSize:12,color:"#7b4f12",fontWeight:600}}>
                Form is locked — click UNLOCKED in the header to edit
              </span>
            </div>
          )}

          <div style={{pointerEvents:locked?"none":"auto",opacity:locked?0.65:1,transition:"opacity 0.2s"}}>

            {/* ── Row 1: Quote Info | Test Item Description ── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>

              {/* Quote Info */}
              <div style={{...card}}>
                <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:8}}>QUOTE INFORMATION</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
                  <div>
                    {[["Account","account"],["Contact","contact"],["Email","email"],["RFQ / PO","rfq"]].map(([l,k])=>(
                      <div key={k} style={{marginBottom:6}}>
                        <div style={{fontSize:9,color:C.dim,marginBottom:2}}>{l}</div>
                        <input value={qi[k]||""} onChange={e=>setQi({...qi,[k]:e.target.value})} style={{...inp,width:"100%"}}/>
                      </div>
                    ))}
                    <div style={{marginBottom:6}}>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Bill To</div>
                      <input value={qi.billTo||""} onChange={e=>setQi({...qi,billTo:e.target.value})}
                        placeholder="Street address" style={{...inp,width:"100%",marginBottom:3,color:qi.billTo?C.text:C.muted}}/>
                      <input value={qi.billToCity||""} onChange={e=>setQi({...qi,billToCity:e.target.value})}
                        placeholder="City, State, Zip" style={{...inp,width:"100%",color:qi.billToCity?C.text:C.muted}}/>
                    </div>
                    <div style={{marginBottom:6}}>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Type</div>
                      <select value={qi.type||"New Business"} onChange={e=>setQi({...qi,type:e.target.value})} style={{...sel,width:"100%"}}>
                        {["New Business","Existing Business"].map(o=><option key={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    {[["Opportunity #","opp"],["Prepared By","prepby"],["Quote Revision","rev"],["Related Opps","relatedOpps"]].map(([l,k])=>(
                      <div key={k} style={{marginBottom:6}}>
                        <div style={{fontSize:9,color:C.dim,marginBottom:2}}>{l}</div>
                        <input value={qi[k]||""} onChange={e=>setQi({...qi,[k]:e.target.value})} style={{...inp,width:"100%"}}/>
                      </div>
                    ))}
                    <div style={{marginBottom:6}}>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Stage</div>
                      <select value={qi.stage} onChange={e=>{
                        const s=e.target.value;
                        setQi({...qi,stage:s});
                        if(s==="Closed Won"&&!wonInfo.wonDate)
                          setWonInfo(w=>({...w,wonDate:new Date().toLocaleDateString("en-US")}));
                      }} style={{...sel,width:"100%"}}>
                        {["Proposal/Price Quote","Budgetary","Closed Won","Closed Lost","Other"].map(o=><option key={o}>{o}</option>)}
                      </select>
                      {qi.stage==="Closed Won"&&(
                        <button onClick={()=>setShowWonModal(true)}
                          style={{marginTop:5,width:"100%",background:"#1e8449",border:"none",borderRadius:6,
                            padding:"5px 0",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",letterSpacing:.3}}>
                          🏆 Won Details
                        </button>
                      )}
                    </div>
                    <div style={{marginBottom:6}}>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Modified Date</div>
                      <input value={qi.date||""} onChange={e=>setQi({...qi,date:e.target.value})} style={{...inp,width:"100%"}}/>
                    </div>
                  </div>
                </div>
              </div>

              {/* Test Item Description */}
              <div style={{...card}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2}}>TEST ITEM DESCRIPTION</div>
                  {qi.stage==="Closed Won"&&(
                    <button onClick={()=>setShowWonModal(true)}
                      style={{background:"#1e8449",border:"none",borderRadius:6,padding:"3px 10px",
                        color:"#fff",fontWeight:700,fontSize:10,cursor:"pointer",letterSpacing:.3,display:"flex",alignItems:"center",gap:4}}>
                      🏆 {wonInfo.jobNum?("Job #"+wonInfo.jobNum):"Won Details"}
                    </button>
                  )}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
                  {[["Item","item"],["Qty","qty"],["Model No.","model"],["Drawing No.","drawing"]].map(([l,k])=>(
                    <div key={k}>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>{l}</div>
                      <input value={ti[k]||""} onChange={e=>setTi({...ti,[k]:e.target.value})} style={{...inp,width:"100%"}}/>
                    </div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}>L x W x H (in)</div>
                    <div style={{display:"flex",gap:3}}>
                      {[["dimL","L"],["dimW","W"],["dimH","H"]].map(([k,lbl])=>(
                        <input key={k} value={ti[k]||""} onChange={e=>setTi({...ti,[k]:e.target.value})}
                          placeholder={lbl} style={{...inp,width:"100%"}}/>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Weight (lbs)</div>
                    <input value={ti.wt||""} onChange={e=>setTi({...ti,wt:e.target.value})} style={{...inp,width:"100%"}}/>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Voltage</div>
                    <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      <input value={ti.volt||""} onChange={e=>setTi({...ti,volt:e.target.value})} style={{...inp,width:"100%"}}/>
                      {["AC","DC"].map(t=>(
                        <label key={t} style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",flexShrink:0}}>
                          <input type="checkbox" checked={(ti.pwrType||"AC")===t}
                            onChange={()=>setTi({...ti,pwrType:t})}
                            style={{accentColor:C.red,width:11,height:11}}/>
                          <span style={{fontSize:10,color:(ti.pwrType||"AC")===t?C.red:C.muted,fontWeight:(ti.pwrType||"AC")===t?700:400}}>{t}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {[["Phase","phase"],["Hz","hz"],["Inrush (A)","inrush"],["Op. Amps","amps"]].map(([l,k])=>(
                    <div key={k}>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>{l}</div>
                      <input value={ti[k]||""} onChange={e=>setTi({...ti,[k]:e.target.value})} style={{...inp,width:"100%"}}/>
                    </div>
                  ))}
                </div>
                <div style={{marginBottom:6}}>
                  <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Loads</div>
                  <input
                    value={ti.loads!==""?ti.loads:(qi.account?"All electrical and/or resistive loads will be provided by "+qi.account+" unless otherwise discussed.":"")}
                    onChange={e=>setTi({...ti,loads:e.target.value})}
                    onFocus={e=>{if(!ti.loads&&qi.account)setTi({...ti,loads:"All electrical and/or resistive loads will be provided by "+qi.account+" unless otherwise discussed."});}}
                    placeholder={qi.account?"Auto: will use Account name":"Enter load details"}
                    style={{...inp,width:"100%"}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Mounting</div>
                    <input value={ti.mounting||""} onChange={e=>setTi({...ti,mounting:e.target.value})} style={{...inp,width:"100%"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Pressure/Flow</div>
                    <input value={ti.pressureFlow||""} onChange={e=>setTi({...ti,pressureFlow:e.target.value})} style={{...inp,width:"100%"}}/>
                  </div>
                </div>
                <div style={{background:C.panel,borderRadius:7,padding:"6px 10px",marginBottom:8}}>
                  <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:1,marginBottom:6}}>REGULATORY</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
                    {[["GSI","gsi",["Unknown","Yes","No"]],["Cust. Witness","witness",["Unknown","Yes","No"]],["Doc Restriction","docRestriction",["None","ITAR","CUI/Other","NOFORN","Dist Statement B/C/D/E"]]].map(([l,k,opts])=>(
                      <div key={k}>
                        <div style={{fontSize:9,color:C.dim,marginBottom:2}}>{l}</div>
                        <select value={ti[k]||opts[0]} onChange={e=>setTi({...ti,[k]:e.target.value})} style={{...sel,width:"100%"}}>
                          {opts.map(o=><option key={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                    <div>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>DPAS Rating</div>
                      <input value={ti.dpas||""} onChange={e=>setTi({...ti,dpas:e.target.value})} style={{...inp,width:"100%"}}/>
                    </div>
                  </div>
                </div>
              </div>
            </div>{/* end Row 1 */}

            {/* ── Row 2: Setup Details | Budget + Subcontracting ── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>

              {/* Setup Details */}
              <div style={{...card}}>
                <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:8}}>SETUP DETAILS</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Tech Rate ($/hr)</div>
                    <Inp value={setup.techRate} onChange={v=>setSetup({...setup,techRate:v})} width={70} right/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Fab &amp; Mod Hours</div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <Inp value={setup.fabHours} onChange={v=>setSetup({...setup,fabHours:v})} width={60} right/>
                      <span style={{fontSize:10,color:C.muted}}>{"= $"+Math.round(sf(setup.fabHours,4)*sf(setup.techRate,175)).toLocaleString()}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}># Holes (drilling)</div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <Inp value={setup.holes} onChange={v=>setSetup({...setup,holes:v})} width={60} right/>
                      <span style={{fontSize:10,color:C.muted}}>{"= $"+Math.round(sf(setup.holes,0)*0.5*sf(setup.techRate,175)*(setup.drillTap?1.5:1)).toLocaleString()}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}># Cables (EMI)</div>
                    <Inp value={setup.cables} onChange={v=>setSetup({...setup,cables:v})} width={60} right/>
                  </div>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",marginBottom:8}}>
                  <input type="checkbox" checked={setup.drillTap}
                    onChange={e=>setSetup({...setup,drillTap:e.target.checked})}
                    style={{accentColor:C.red,width:14,height:14}}/>
                  <span style={{fontSize:11,color:setup.drillTap?C.red:C.muted,fontWeight:setup.drillTap?600:400}}>
                    Drill &amp; Tap (x1.5 on drilling cost)
                  </span>
                </label>
                {(sf(setup.holes,0)>0||sf(setup.fabHours,0)>4)&&(
                  <div style={{fontSize:10,color:C.muted,padding:"5px 8px",background:C.panel,borderRadius:5,lineHeight:1.7}}>
                    {sf(setup.holes,0)>0&&<div>{"Drilling: "}{setup.holes}{" hole(s) x 30 min @ $"}{sf(setup.techRate,175).toLocaleString()}{"/hr"}{setup.drillTap?" x 1.5 (D&T)":""}{" = "}<b>{"$"}{Math.round(sf(setup.holes,0)*0.5*sf(setup.techRate,175)*(setup.drillTap?1.5:1)).toLocaleString()}</b></div>}
                    {sf(setup.fabHours,0)>0&&<div>{"Fab & Mod: "}{setup.fabHours}{" hr(s) x $"}{sf(setup.techRate,175).toLocaleString()}{"/hr = "}<b>{"$"}{Math.round(sf(setup.fabHours,0)*sf(setup.techRate,175)).toLocaleString()}</b></div>}
                  </div>
                )}
                {anyOn&&<div style={{marginTop:8}}><PRow label="Tear Down Override (0=auto)" val={td} onChange={setTd}/></div>}
              </div>

              {/* Budget + Subcontracting stacked */}
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <BudgetSection budget={budget} setBudget={setBudget} setupLines={summary.setupLineLabels||[]}/>
                <div style={{...card}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:sub.on?8:0}}>
                    <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2}}>SUBCONTRACTING</div>
                    <Toggle small checked={sub.on||false} onChange={v=>setSub({...sub,on:v})} label=""/>
                  </div>
                  {sub.on&&(
                    <div>
                      {sub.rows.map((r,i)=>(
                        <div key={i} style={{background:C.panel,borderRadius:7,padding:"7px 10px",marginBottom:5}}>
                          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
                            <span style={{fontSize:9,color:"#2563eb",background:"#dbeafe",borderRadius:4,padding:"2px 5px",fontWeight:700,flexShrink:0}}>98</span>
                            <Inp value={r.desc} onChange={v=>setSub({...sub,rows:sub.rows.map((x,j)=>j===i?{...x,desc:v}:x)})} width={160}/>
                            <span style={{fontSize:11,color:C.muted}}>$</span>
                            <Inp value={r.price} onChange={v=>setSub({...sub,rows:sub.rows.map((x,j)=>j===i?{...x,price:v}:x)})} width={80} right/>
                            <button onClick={()=>setSub({...sub,rows:sub.rows.filter((_,j)=>j!==i)})}
                              style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>✕</button>
                          </div>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            <span style={{fontSize:9,color:C.dim,flexShrink:0}}>Identifier:</span>
                            <Inp value={r.identifier||""} onChange={v=>setSub({...sub,rows:sub.rows.map((x,j)=>j===i?{...x,identifier:v}:x)})}
                              width={240} placeholder="Vendor / part / description"/>
                          </div>
                        </div>
                      ))}
                      <button onClick={()=>setSub({...sub,rows:[...sub.rows,{desc:"Subcontract Item",price:"0",identifier:""}]})}
                        style={{background:"none",border:"1px dashed "+C.border,borderRadius:7,color:C.muted,padding:"5px 12px",cursor:"pointer",fontSize:11,width:"100%"}}>
                        + Add Subcontract Row
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>{/* end Row 2 */}

            {/* ── Row 3: Specifications & Notes (stacked) ── */}
            <div style={{...card,marginBottom:10,display:"flex",flexDirection:"column",gap:12}}>
              {/* Specifications */}
              <div>
                <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:3}}>SPECIFICATIONS</div>
                <div style={{fontSize:9,color:C.dim,marginBottom:4}}>Auto-generated from enabled tests. Shown on quote PDF. Edit to override.</div>
                <textarea
                  value={ti.tiSpecs||autoSpecs||""}
                  onChange={e=>setTi({...ti,tiSpecs:e.target.value})}
                  placeholder="Enable test sections to auto-generate scope text, or type here..."
                  rows={5}
                  style={{...inp,width:"100%",resize:"vertical",fontSize:11,lineHeight:1.6}}/>
                {ti.tiSpecs&&ti.tiSpecs!==autoSpecs&&(
                  <button onClick={()=>setTi({...ti,tiSpecs:""})}
                    style={{fontSize:9,color:C.dim,background:"none",border:"none",cursor:"pointer",padding:"2px 0",marginTop:2}}>
                    ↺ Reset to auto-generated
                  </button>
                )}
              </div>
              {/* Notes to customer */}
              <div>
                <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:3}}>NOTES</div>
                <div style={{fontSize:9,color:C.dim,marginBottom:4}}>Customer-facing notes. Shown on quote PDF. Auto-populates based on selected tests.</div>
                <textarea
                  value={ti.tiNotes||autoNotes||""}
                  onChange={e=>setTi({...ti,tiNotes:e.target.value})}
                  placeholder="Notes will auto-populate based on selected tests..."
                  rows={5}
                  style={{...inp,width:"100%",resize:"vertical",fontSize:11,lineHeight:1.6}}/>
                {ti.tiNotes&&ti.tiNotes!==autoNotes&&(
                  <button onClick={()=>setTi({...ti,tiNotes:""})}
                    style={{fontSize:9,color:C.dim,background:"none",border:"none",cursor:"pointer",padding:"2px 0",marginTop:2}}>
                    ↺ Reset to auto-generated
                  </button>
                )}
              </div>
            </div>

            {/* ── Row 4: Quote Summary ── */}
            <div style={{...card,marginBottom:10}}>
              <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:6}}>QUOTE SUMMARY</div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
                <Toggle small checked={splitProcReport} onChange={setSplitProcReport} label="List Proc/Reports Individually"/>
              </div>
              {qi.opp&&<div style={{fontSize:13,color:C.red,fontWeight:600,marginBottom:2}}>
                {qi.opp}{qi.rev?" Rev "+qi.rev:""}
              </div>}
              {(qi.billTo||qi.account)&&<div style={{fontSize:11,color:C.muted,marginBottom:4}}>{qi.billTo||qi.account}</div>}
              {qi.rfq&&<div style={{fontSize:10,color:C.dim,marginBottom:10}}>{"RFQ: "}{qi.rfq}</div>}
              {summary.lines.length===0?(
                <div style={{color:C.border,fontSize:12,textAlign:"center",marginTop:30,marginBottom:30,lineHeight:1.8}}>
                  Enable a test section<br/>to see pricing
                </div>
              ):(
                <>
                  {/* Column headers */}
                  <div style={{display:"grid",gridTemplateColumns:"14px 36px 1fr 130px 80px 20px",gap:4,alignItems:"center",
                    borderBottom:"2px solid "+C.border,paddingBottom:4,marginBottom:4}}>
                    <span/>
                    <span style={{fontSize:9,color:C.dim,fontWeight:700}}>CODE</span>
                    <span style={{fontSize:9,color:C.dim,fontWeight:700}}>DESCRIPTION / NOTE</span>
                    <span style={{fontSize:9,color:C.dim,fontWeight:700}}></span>
                    <span style={{fontSize:9,color:C.dim,fontWeight:700,textAlign:"right"}}>AMOUNT</span>
                    <span/>
                  </div>
                  {(()=>{
                    const order=lineOrder&&lineOrder.length===summary.lines.length?lineOrder:summary.lines.map((_,i)=>i);
                    return order.map((origIdx,dispIdx)=>{
                      const l=summary.lines[origIdx];
                      const ov=lineOverrides[origIdx]||{};
                      if(ov.deleted)return null;
                      const dispPrice=ov.price!==undefined?ov.price:String(l.val);
                      const dispDesc=ov.desc!==undefined?ov.desc:"";
                      const isDragging=dragIdx===dispIdx;
                      return(
                        <div key={origIdx}
                          draggable
                          onDragStart={()=>setDragIdx(dispIdx)}
                          onDragOver={e=>{e.preventDefault();if(dragIdx!==null&&dragIdx!==dispIdx){
                            const newOrder=[...order];
                            const [moved]=newOrder.splice(dragIdx,1);
                            newOrder.splice(dispIdx,0,moved);
                            setLineOrder(newOrder);
                            setDragIdx(dispIdx);
                          }}}
                          onDragEnd={()=>setDragIdx(null)}
                          style={{display:"grid",gridTemplateColumns:"14px 36px 1fr 130px 80px 20px",
                            gap:4,alignItems:"center",borderBottom:"1px solid "+C.border,
                            padding:"5px 0",background:isDragging?"#f0f4ff":dispIdx%2===0?"transparent":C.panel+"66",
                            cursor:"grab",opacity:isDragging?0.5:1}}>
                          {/* Drag handle */}
                          <span style={{fontSize:10,color:C.dim,cursor:"grab",userSelect:"none",textAlign:"center"}}>⠿</span>
                          {/* Code badge */}
                          <span style={{fontSize:9,color:"#6b7a8d",background:C.panel,borderRadius:3,
                            padding:"2px 4px",fontFamily:"monospace",textAlign:"center",
                            border:"1px solid "+C.border}}>
                            {l.code||"—"}
                          </span>
                          {/* Label + optional description input */}
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:11,color:C.text,fontWeight:500,lineHeight:1.3}}>{l.label}</div>
                            <input
                              value={dispDesc}
                              onChange={e=>setLineOverrides({...lineOverrides,[origIdx]:{...ov,desc:e.target.value||undefined}})}
                              placeholder="+ line item description (optional)"
                              style={{width:"100%",fontSize:9,color:C.muted,background:"transparent",
                                border:"none",outline:"none",padding:"1px 0",marginTop:1,
                                fontStyle:dispDesc?"normal":"italic",boxSizing:"border-box"}}/>
                          </div>
                          {/* empty spacer */}
                          <span/>
                          {/* Price — editable, bold */}
                          <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:2}}>
                            <span style={{fontSize:10,color:C.muted}}>$</span>
                            <input
                              value={dispPrice}
                              onChange={e=>setLineOverrides({...lineOverrides,[origIdx]:{...ov,price:e.target.value}})}
                              style={{width:68,fontSize:12,fontWeight:700,color:C.text,fontFamily:"monospace",
                                background:"transparent",border:"none",borderBottom:"1px solid "+C.border,
                                outline:"none",textAlign:"right",padding:"1px 2px"}}/>
                          </div>
                          {/* Delete */}
                          <button onClick={()=>setLineOverrides({...lineOverrides,[origIdx]:{...ov,deleted:true}})}
                            style={{background:"none",border:"none",color:C.dim,cursor:"pointer",
                              fontSize:12,padding:0,lineHeight:1,textAlign:"center"}}
                            title="Remove line">✕</button>
                        </div>
                      );
                    });
                  })()}
                  {(Object.values(lineOverrides).some(o=>o.deleted)||lineOrder)&&(
                    <div style={{display:"flex",gap:10,marginTop:4}}>
                      {Object.values(lineOverrides).some(o=>o.deleted)&&(
                        <button onClick={()=>setLineOverrides({})}
                          style={{fontSize:9,color:C.dim,background:"none",border:"none",cursor:"pointer",padding:0}}>
                          ↺ Restore deleted lines
                        </button>
                      )}
                      {lineOrder&&(
                        <button onClick={()=>setLineOrder(null)}
                          style={{fontSize:9,color:C.dim,background:"none",border:"none",cursor:"pointer",padding:0}}>
                          ↺ Reset order
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{marginTop:10,padding:"8px 0",borderTop:"2px solid "+C.red,
                    display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                    <span style={{fontWeight:700,fontSize:13,color:C.text}}>TOTAL</span>
                    <span style={{fontWeight:700,fontSize:16,color:C.red,fontFamily:"monospace"}}>
                      {money(summary.lines.reduce((a,l,idx)=>{
                        const ov=lineOverrides[idx]||{};
                        if(ov.deleted)return a;
                        return a+(ov.price!==undefined?sf(ov.price):l.val);
                      },0))}
                    </span>
                  </div>
                  <button onClick={exportPDF}
                    style={{width:"100%",marginTop:8,background:C.red,border:"none",borderRadius:8,
                      padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                    EXPORT QUOTE PDF
                  </button>
                  {budget.on&&budget.rows.length>0&&(
                    <button onClick={exportBudgetPDF}
                      style={{width:"100%",marginTop:6,background:C.accent,border:"none",borderRadius:8,
                        padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                      EXPORT BUDGET PDF
                    </button>
                  )}
                  {dcms.some(s=>s.on)&&(
                    <button onClick={exportDcMagPDF}
                      style={{width:"100%",marginTop:6,background:"#166534",border:"none",borderRadius:8,
                        padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                      DC MAGNETICS — TEST SPECIFICATIONS
                    </button>
                  )}
                  {pqs.some(s=>s.on&&Object.entries(s.rows||{}).some(([k,v])=>v&&k.startsWith('B')))&&(
                    <button onClick={exportPq300bPDF}
                      style={{width:"100%",marginTop:6,background:"#1a5276",border:"none",borderRadius:8,
                        padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                      PQ 300B — TEST SPECIFICATIONS
                    </button>
                  )}
                  {pqs.some(s=>s.on&&Object.entries(s.rows||{}).some(([k,v])=>v&&!k.startsWith('B')))&&(
                    <button onClick={exportPq300Part1PDF}
                      style={{width:"100%",marginTop:6,background:"#154360",border:"none",borderRadius:8,
                        padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                      PQ 300 PART 1 — TEST SPECIFICATIONS
                    </button>
                  )}
                  {emis.some(s=>s.on&&Object.values(s.tests||{}).some(v=>v)&&(s.revs?.['Rev F']||!s.revs?.['Rev G']))&&(
                    <button onClick={exportEmi461fPDF}
                      style={{width:"100%",marginTop:6,background:"#4a1942",border:"none",borderRadius:8,
                        padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                      461F — TEST SPECIFICATIONS
                    </button>
                  )}
                  {emis.some(s=>s.on&&Object.values(s.tests||{}).some(v=>v)&&(s.revs?.['Rev G']||!s.revs?.['Rev F']))&&(
                    <button onClick={exportEmi461gPDF}
                      style={{width:"100%",marginTop:6,background:"#1a3a4a",border:"none",borderRadius:8,
                        padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                      461G — TEST SPECIFICATIONS
                    </button>
                  )}
                </>
              )}
            </div>{/* end Row 4 */}

            {/* ── Row 5+: Test sections ── */}
            <MultiSection title="VIBRATION  (MIL-STD-167)" instances={vibs}
              onAdd={mkAdder(vibs,setVibs,newVib)}
              onRemove={mkRemover(vibs,setVibs)}
              onUpdate={mkUpdater(vibs,setVibs)}
              Form={VibForm} formProps={setupProps}/>

            <MultiSection title="SHOCK TESTING  (MIL-STD-901)" instances={shocks}
              onAdd={mkAdder(shocks,setShocks,newShock)}
              onRemove={mkRemover(shocks,setShocks)}
              onUpdate={mkUpdater(shocks,setShocks)}
              Form={ShockForm} formProps={{vibSetup,ti,...setupProps}}/>

            <Section title="INSTRUMENTATION" enabled={inst.on} onToggle={v=>setInst({...inst,on:v})}>
              <InstForm s={inst} set={setInst}/>
            </Section>

            <MultiSection title="NOISE SUSCEPTIBILITY  (MIL-STD-810)" instances={noises}
              onAdd={mkAdder(noises,setNoises,newNoise)}
              onRemove={mkRemover(noises,setNoises)}
              onUpdate={mkUpdater(noises,setNoises)}
              Form={NoiseForm} formProps={{ti,...setupProps}}/>

            <MultiSection title="ENVIRONMENTAL TESTING" instances={envs}
              onAdd={mkAdder(envs,setEnvs,newEnv)}
              onRemove={mkRemover(envs,setEnvs)}
              onUpdate={mkUpdater(envs,setEnvs)}
              Form={EnvForm} formProps={{}}/>

            <MultiSection title="HIGH FREQUENCY VIBRATION" instances={hfvs}
              onAdd={mkAdder(hfvs,setHfvs,newHfv)}
              onRemove={mkRemover(hfvs,setHfvs)}
              onUpdate={mkUpdater(hfvs,setHfvs)}
              Form={HfvForm} formProps={setupProps}/>

            <MultiSection title="SHOCK (OTHER)" instances={shos}
              onAdd={mkAdder(shos,setShos,newSho)}
              onRemove={mkRemover(shos,setShos)}
              onUpdate={mkUpdater(shos,setShos)}
              Form={ShoForm} formProps={setupProps}/>

            <MultiSection title="EMI TESTING  (MIL-STD-461)" tag="SHIFTS" instances={emis}
              onAdd={mkAdder(emis,setEmis,newEmi)}
              onRemove={mkRemover(emis,setEmis)}
              onUpdate={mkUpdater(emis,setEmis)}
              Form={EmiForm} formProps={{ti}}/>

            <MultiSection title="POWER QUALITY  (MIL-STD-1399)" tag="SHIFTS" instances={pqs}
              onAdd={mkAdder(pqs,setPqs,newPq)}
              onRemove={mkRemover(pqs,setPqs)}
              onUpdate={mkUpdater(pqs,setPqs)}
              Form={PqForm} formProps={{ti}}/>

            <MultiSection title="DC MAGNETICS" tag="SHIFTS" instances={dcms}
              onAdd={mkAdder(dcms,setDcms,newDcm)}
              onRemove={mkRemover(dcms,setDcms)}
              onUpdate={mkUpdater(dcms,setDcms)}
              Form={DcmForm} formProps={{}}/>

            <MultiSection title="AIRBORNE NOISE" instances={abs}
              onAdd={mkAdder(abs,setAbs,newAb)}
              onRemove={mkRemover(abs,setAbs)}
              onUpdate={mkUpdater(abs,setAbs)}
              Form={AbForm} formProps={setupProps}/>

            <MultiSection title="STRUCTUREBORNE NOISE" instances={sbs}
              onAdd={mkAdder(sbs,setSbs,newSb)}
              onRemove={mkRemover(sbs,setSbs)}
              onUpdate={mkUpdater(sbs,setSbs)}
              Form={SbForm} formProps={setupProps}/>

            <Section title="OVERTIME" enabled={ot.on} onToggle={v=>setOt({...ot,on:v})}>
              <OtForm s={ot} set={setOt}/>
            </Section>

            {/* ── Global Procedures / Reports / CoC ── */}
            {(()=>{
              const pr=globalPR;
              const anyPR=pr.procs.length>0||pr.reps.length>0||pr.coc;
              const addProc=()=>setGlobalPR({...pr,procs:[...pr.procs,{label:"Test Procedure",price:"1750"}]});
              const addRep=()=>setGlobalPR({...pr,reps:[...pr.reps,{label:"Test Report",price:"1050"}]});
              const updProc=(i,k,v)=>setGlobalPR({...pr,procs:pr.procs.map((r,j)=>j===i?{...r,[k]:v}:r)});
              const updRep=(i,k,v)=>setGlobalPR({...pr,reps:pr.reps.map((r,j)=>j===i?{...r,[k]:v}:r)});
              const remProc=i=>setGlobalPR({...pr,procs:pr.procs.filter((_,j)=>j!==i)});
              const remRep=i=>setGlobalPR({...pr,reps:pr.reps.filter((_,j)=>j!==i)});
              return(
                <div style={{...card,padding:0,overflow:"hidden",border:"1px solid "+(anyPR?C.red+"66":C.border),
                  boxShadow:anyPR?"0 1px 4px rgba(192,57,43,0.12)":"0 1px 3px rgba(0,0,0,0.06)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:9,padding:"10px 14px",
                    background:anyPR?"#fdf3f2":C.card}}>
                    <span style={{fontWeight:600,fontSize:12,color:anyPR?C.red:C.muted,flex:1,letterSpacing:.3}}>
                      TEST PROCEDURES &amp; REPORTS
                    </span>
                  </div>
                  <div style={{padding:"12px 14px 14px",background:"#fff"}}>
                    <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:1,marginBottom:6}}>PROCEDURES — CODE 42</div>
                    {pr.procs.map((r,i)=>(
                      <div key={i} style={{display:"flex",gap:6,alignItems:"center",marginBottom:5,
                        background:C.panel,borderRadius:7,padding:"6px 8px"}}>
                        <span style={{fontSize:9,background:"#e8ecf0",color:C.muted,borderRadius:3,
                          padding:"2px 5px",fontFamily:"monospace",border:"1px solid "+C.border}}>42</span>
                        <Inp value={r.label} onChange={v=>updProc(i,"label",v)} width={180}/>
                        <span style={{fontSize:11,color:C.muted}}>$</span>
                        <Inp value={r.price} onChange={v=>updProc(i,"price",v)} width={70} right/>
                        <button onClick={()=>remProc(i)} style={{background:"none",border:"none",
                          color:C.dim,cursor:"pointer",fontSize:13,marginLeft:"auto"}}>✕</button>
                      </div>
                    ))}
                    <button onClick={addProc} style={{background:"none",border:"none",color:C.accent,
                      cursor:"pointer",fontSize:11,padding:0,marginBottom:10}}>
                      + Add test procedure
                    </button>
                    <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:1,marginBottom:6,marginTop:4}}>REPORTS — CODE 41</div>
                    {pr.reps.map((r,i)=>(
                      <div key={i} style={{display:"flex",gap:6,alignItems:"center",marginBottom:5,
                        background:C.panel,borderRadius:7,padding:"6px 8px"}}>
                        <span style={{fontSize:9,background:"#e8ecf0",color:C.muted,borderRadius:3,
                          padding:"2px 5px",fontFamily:"monospace",border:"1px solid "+C.border}}>41</span>
                        <Inp value={r.label} onChange={v=>updRep(i,"label",v)} width={180}/>
                        <span style={{fontSize:11,color:C.muted}}>$</span>
                        <Inp value={r.price} onChange={v=>updRep(i,"price",v)} width={70} right/>
                        <button onClick={()=>remRep(i)} style={{background:"none",border:"none",
                          color:C.dim,cursor:"pointer",fontSize:13,marginLeft:"auto"}}>✕</button>
                      </div>
                    ))}
                    <button onClick={addRep} style={{background:"none",border:"none",color:C.accent,
                      cursor:"pointer",fontSize:11,padding:0,marginBottom:10}}>
                      + Add test report
                    </button>
                    <div style={{borderTop:"1px solid "+C.border,paddingTop:10,marginTop:4}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <Toggle small checked={pr.coc||false} onChange={v=>setGlobalPR({...pr,coc:v})}
                          label="Certificate of Compliance"/>
                        {pr.coc&&(
                          <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:"auto"}}>
                            <span style={{fontSize:9,background:"#e8ecf0",color:C.muted,borderRadius:3,
                              padding:"2px 5px",fontFamily:"monospace",border:"1px solid "+C.border}}>41</span>
                            <span style={{fontSize:11,color:C.muted}}>$</span>
                            <Inp value={pr.cocPrice||"250"} onChange={v=>setGlobalPR({...pr,cocPrice:v})} width={70} right/>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <Section title="CUSTOM LINE ITEMS" enabled={custom.on} onToggle={v=>setCustom({...custom,on:v})}>
              <CustomForm s={custom} set={setCustom}/>
            </Section>

          </div>{/* end pointer-events wrapper */}
        </div>{/* end left scroll column */}

      </div>{/* end body flex row */}
    </div>
  );
}
