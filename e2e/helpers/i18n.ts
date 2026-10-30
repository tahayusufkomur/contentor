import { manage } from "./compose";

/** What the running backend says for `msgid` in `lang`: the compiled catalog the app itself uses.
 * Fails while it is still English, so a test can't pass on an untranslated message. */
export function translated(msgid: string, lang = "tr"): string {
  const out = manage([
    "shell",
    "-c",
    "import json\n" +
      "from django.utils.translation import gettext, override\n" +
      `with override(${JSON.stringify(lang)}):\n` +
      `    print('T:' + json.dumps(gettext(${JSON.stringify(msgid)})))`,
  ]);
  const line = out.split("\n").find((l) => l.startsWith("T:"));
  if (!line) throw new Error(`no translation output for ${msgid}: ${out}`);
  const text = JSON.parse(line.slice(2)) as string;
  if (text === msgid) throw new Error(`${lang} has no translation for ${JSON.stringify(msgid)}: run make translate`);
  return text;
}
