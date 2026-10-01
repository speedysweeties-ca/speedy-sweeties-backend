// Preserve the published analytics and page code while composing the site blocks.
const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const baseline = JSON.parse(read("backups/2026-10-01-before-tracking.json"));
const site = baseline.find(item => item.action === "get_site_freeform_code").result;
const head = site.find(item => item.location === "head").content;
const footer = site.find(item => item.location === "footer").content;
const originalForm = footer.match(/<script>[\s\S]*?<\/script>/)[0];
if (!originalForm.includes('document.getElementById("email-form")')) throw new Error("Unexpected baseline form script");
const newHead = "<script>\n" + read("order-tracking-head.js") + "</script>\n" + head;
const newFooter = footer.replace(originalForm, "<script>\n" + read("order-form.js") + "</script>") +
  "\n\n<!-- Speedy Sweeties website order tracking v1 -->\n<style>\n" + read("order-tracking.css") + "</style>\n<script>\n" + read("order-tracking.js") + "</script>\n";
for (const [file, code] of [["site-head.html", newHead], ["site-footer.html", newFooter]]) {
  if (code.length > 50000) throw new Error(file + " exceeds the custom-code block limit");
  fs.writeFileSync(path.join(root, file), code);
}
console.log("Website blocks generated; original analytics preserved.");
