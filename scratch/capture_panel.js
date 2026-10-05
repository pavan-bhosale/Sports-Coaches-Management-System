const puppeteer = require("puppeteer");
const path = require("path");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto("http://localhost/VAVA_sports/scratch/session_helper.php");
  await page.evaluate(async () => {
    const fd = new FormData();
    fd.append("role", "student");
    fd.append("email", "aarav.sharma@vavasports.local");
    fd.append("student_id", "3");
    await fetch("session_helper.php", { method: "POST", body: fd });
  });
  await page.evaluate(() => {
    localStorage.setItem("user", JSON.stringify({
      role: "student",
      email: "aarav.sharma@vavasports.local",
      name: "Aarav Sharma",
      student_id: 3
    }));
  });
  await page.goto("http://localhost/VAVA_sports/dashboard.html#overview", { waitUntil: "networkidle2" });
  await page.waitForSelector("#panelStudentFees", { visible: true });
  await new Promise(r => setTimeout(r, 600));

  const el = await page.$("#panelStudentFees");
  if (el) {
    await el.screenshot({ path: path.join(__dirname, "screenshots", "student_fees_panel_desktop.png") });
  }

  await page.setViewport({ width: 375, height: 900 });
  await new Promise(r => setTimeout(r, 300));
  const elMobile = await page.$("#panelStudentFees");
  if (elMobile) {
    await elMobile.screenshot({ path: path.join(__dirname, "screenshots", "student_fees_panel_mobile_375px.png") });
  }

  await browser.close();
  console.log("Panel screenshots captured successfully.");
})();
