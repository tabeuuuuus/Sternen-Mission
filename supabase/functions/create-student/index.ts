// Supabase Edge Function: create-student
// Deploy with legacy JWT verification disabled; function verifies the user token itself. SUPABASE_SERVICE_ROLE_KEY stays server-side.
import { createClient } from "npm:@supabase/supabase-js@2";
const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGIN = "https://tabeuuuuus.github.io";
const headers = {"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-supabase-api-version","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Vary":"Origin"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomChars(n:number){const bytes=crypto.getRandomValues(new Uint8Array(n));return Array.from(bytes,b=>alphabet[b%alphabet.length]).join("")}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 if(req.headers.get("Origin")!==ORIGIN)return json({error:"Origin not allowed"},403);
 const auth=req.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer "))return json({error:"Authentication required"},401);
 try{
  const client=createClient(PROJECT_URL,PUBLIC_KEY,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:authError}=await client.auth.getUser(auth.substring(7));
  if(authError||!user)return json({error:"Invalid session"},401);
  const admin=createClient(PROJECT_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:teacher,error:teacherError}=await admin.from("sm_teachers").select("user_id").eq("user_id",user.id).maybeSingle();
  if(teacherError||!teacher)return json({error:"Only teachers can create students"},403);
  const input=await req.json().catch(()=>null);
  const nickname=typeof input?.nickname==="string"?input.nickname.trim():"";
  if(nickname.length<1||nickname.length>40)return json({error:"Pseudonym muss 1 bis 40 Zeichen enthalten"},400);
  const loginId=randomChars(12),password=randomChars(24);
  const email=`sm-${loginId.toLowerCase()}@students.sternen-mission.invalid`;
  const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{role:"student"}});
  if(createError||!created.user)return json({error:"Konto konnte nicht angelegt werden"},500);
  const id=created.user.id;
  const {data:student,error:studentError}=await admin.from("sm_students").insert({teacher_id:user.id,auth_user_id:id,nickname}).select("id").single();
  if(studentError){await admin.auth.admin.deleteUser(id);return json({error:"Profil konnte nicht gespeichert werden"},500)}
  const {error:progressError}=await admin.from("sm_progress").insert({student_id:student.id});
  if(progressError){await admin.from("sm_students").delete().eq("id",student.id);await admin.auth.admin.deleteUser(id);return json({error:"Spielstand konnte nicht angelegt werden"},500)}
  return json({nickname,code:`SM-${loginId}-${password}`},201);
 }catch{return json({error:"Interner Fehler"},500)}
});
