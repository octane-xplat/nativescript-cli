package org.example.health;
public class Health {
 public static String value() { return "p91-real-native-health"; }
 public static String nativeState(android.content.Context context, String name) throws java.io.IOException {
  java.io.File file=new java.io.File(context.getFilesDir(),"xplat-ota/"+name);
  try(java.io.BufferedReader input=new java.io.BufferedReader(new java.io.FileReader(file))) {return input.readLine();}
 }
 public static void health(android.content.Context context, String json) throws java.io.IOException {
  java.io.File file=new java.io.File(context.getFilesDir(),"p91-health.json");
  java.io.File temp=new java.io.File(context.getFilesDir(),"p91-health.tmp");
  try(java.io.FileWriter output=new java.io.FileWriter(temp)){output.write(json);}
  if(!temp.renameTo(file))throw new java.io.IOException("health publication failed");
 }
}
