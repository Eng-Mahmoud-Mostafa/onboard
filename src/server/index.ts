import app from "./app";

const port = Number(process.env.API_PORT ?? 3001);

app.listen(port, () => {
  console.log(`Onboard CRM API running on http://localhost:${port}`);
});
