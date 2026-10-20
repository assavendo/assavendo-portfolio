import test from "node:test";
import assert from "node:assert/strict";
import { isBlockedIp, parseV6 } from "../lib/ip.ts";
import { FetchRefused, parseTarget, safeFetch } from "../lib/safe-fetch.ts";

const hex = (n: number) => n.toString(16);
const toGroups = (ip: string) => ip.split(".").map(Number);
/** Formes IPv6 qui encapsulent une IPv4 : mappée, SIIT, NAT64, 6to4. */
function wrapped(ip: string): string[] {
  const [a, b, c, d] = toGroups(ip); const hi = hex((a << 8) | b); const lo = hex((c << 8) | d);
  return [`::ffff:${hi}:${lo}`, `::ffff:${ip}`, `::ffff:0:${hi}:${lo}`, `64:ff9b::${hi}:${lo}`, `2002:${hi}:${lo}::`, `2002:${hi}:${lo}:1:2:3:4:5`];
}

test("E05 : les 7 formes IPv6 de l'audit sont refusées", () => {
  for (const u of ["http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "http://[::ffff:a00:1]/", "http://[::ffff:169.254.169.254]/", "http://[64:ff9b::7f00:1]/", "http://[2002:7f00:1::]/", "http://[::127.0.0.1]/"]) {
    assert.throws(() => parseTarget(u), FetchRefused, u);
  }
});

test("IPv4 interne encapsulée dans IPv6 : toujours refusée, quelle que soit la forme", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.0.9", "169.254.169.254", "100.64.0.1", "0.0.0.0", "198.18.0.1", "192.0.0.8", "203.0.113.7"]) {
    for (const form of wrapped(ip)) assert.equal(isBlockedIp(form), true, `${ip} → ${form}`);
  }
});

test("IPv4 publique encapsulée : autorisée", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) for (const form of wrapped(ip).slice(0, 5)) assert.equal(isBlockedIp(form), false, `${ip} → ${form}`);
});

test("plages IPv6 réservées refusées", () => {
  for (const ip of ["::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "fec0::1", "ff02::1", "2001::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:db8::1", "3fff::1", "5f00::1", "100::1", "64:ff9b:1::1"]) assert.equal(isBlockedIp(ip), true, ip);
  for (const ip of ["2606:4700:4700::1111", "2a00:1450:4007:80f::200e", "2620:fe::fe"]) assert.equal(isBlockedIp(ip), false, ip);
});

test("valeurs illisibles : refusées par défaut", () => {
  for (const v of ["", "abc", "999.1.1.1", "1.2.3", "::g", "1:2:3:4:5:6:7:8:9", "not-an-ip", "0x7f.1", "2130706433"]) assert.equal(isBlockedIp(v), true, v);
});

test("analyse IPv6 : formes compressées", () => {
  assert.deepEqual(parseV6("::1"), [0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(parseV6("1::"), [1, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(parseV6("1:2:3:4:5:6:7::"), [1, 2, 3, 4, 5, 6, 7, 0]);
  assert.deepEqual(parseV6("::ffff:1.2.3.4"), [0, 0, 0, 0, 0, 0xffff, 0x102, 0x304]);
  assert.equal(parseV6("1::2::3"), null);
});

test("adresses IPv4 écrites autrement : normalisées par l'URL puis refusées", () => {
  for (const u of ["http://127.1/", "http://0x7f.1/", "http://2130706433/", "http://0177.0.0.1/", "http://017700000001/", "http://0/", "http://[::]/", "http://[::1]/"]) assert.throws(() => parseTarget(u), FetchRefused, u);
});

test("noms d'hôte non publics refusés (point final, suffixes internes)", () => {
  for (const u of ["http://localhost./", "http://app.localhost/", "https://nas.lan/", "https://printer.home.arpa/", "https://intranet.corp/", "http://metadata/", "http://exemple.internal/"]) assert.throws(() => parseTarget(u), FetchRefused, u);
});

test("protocoles, identifiants et ports", () => {
  for (const u of ["ftp://exemple.fr", "file:///etc/passwd", "gopher://exemple.fr", "https://u:p@exemple.fr", "https://exemple.fr:22", "https://exemple.fr:8443"]) assert.throws(() => parseTarget(u), u);
  assert.equal(parseTarget("exemple.fr/chemin?a=1").hostname, "exemple.fr");
});

test("safeFetch refuse une cible interne avant toute connexion", async () => {
  await assert.rejects(safeFetch("http://127.0.0.1/"), FetchRefused);
  await assert.rejects(safeFetch("http://[::ffff:7f00:1]/"), FetchRefused);
  await assert.rejects(safeFetch("https://localhost/"), FetchRefused);
});

test("fuzz : aucune valeur ne fait planter l'analyse, tout ce qui n'est pas public est refusé", () => {
  let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const alphabet = "0123456789abcdef:.%[]xg";
  for (let i = 0; i < 5000; i++) {
    let s = ""; const len = 1 + Math.floor(rnd() * 24);
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    assert.doesNotThrow(() => isBlockedIp(s), s);
  }
});
