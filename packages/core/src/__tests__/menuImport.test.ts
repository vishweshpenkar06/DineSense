import { describe, expect, it } from "vitest";
import { normalizeMenuRows, parseCsv, toCsv } from "../menuImport";

const HEADER = "category,item,local_name,variant,price_ground,price_first,veg,needs_kitchen";

describe("parseCsv", () => {
  it("parses simple rows and CRLF", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quotes, commas and escaped quotes", () => {
    expect(parseCsv('a,b\n"hello, world","say ""hi"""\n')).toEqual([
      ["a", "b"],
      ["hello, world", 'say "hi"'],
    ]);
  });

  it("supports quoted newlines and a BOM", () => {
    expect(parseCsv('\uFEFFa,b\n"line1\nline2",x\n')).toEqual([
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });

  it("ignores blank rows", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("normalizeMenuRows", () => {
  it("groups variants and converts rupees to paise", () => {
    const result = normalizeMenuRows(parseCsv(`${HEADER}
Noodles,Veg Hakka,वेज हक्का,Half,90,100,Y,Y
Noodles,Veg Hakka,वेज हक्का,Full,150,170,Y,Y
Starters,Chicken Lollipop,,Half,130,150,N,Y
`));
    expect(result.errors).toEqual([]);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]!.variants).toHaveLength(2);
    expect(result.groups[0]!.variants[0]!.prices).toEqual({ groundPaise: 9000, firstPaise: 10000 });
    expect(result.groups[0]!.localName).toBe("वेज हक्का");
    expect(result.groups[1]!.isVeg).toBe(false);
  });

  it("warns about a missing floor price", () => {
    const result = normalizeMenuRows(parseCsv(`${HEADER}
Noodles,Veg Hakka,,Half,90,,Y,Y
`));
    expect(result.groups[0]!.variants[0]!.prices).toEqual({ groundPaise: 9000, firstPaise: null });
    expect(result.warnings[0]!.message).toMatch(/AC price/);
  });

  it("reports bad rows and duplicates", () => {
    const result = normalizeMenuRows(parseCsv(`${HEADER}
Noodles,Veg Hakka,,Half,90,abc,Y,Y
Noodles,Veg Hakka,,Full,150,170,maybe,Y
Noodles,Veg Hakka,,Half,90,100,Y,Y
Noodles,Veg Hakka,,Half,90,100,Y,Y
`));
    expect(result.errors).toHaveLength(3);
    expect(result.groups[0]!.variants).toHaveLength(1);
  });

  it("requires the mandatory headers", () => {
    const result = normalizeMenuRows(parseCsv("category,item\nA,B\n"));
    expect(result.errors[0]!.message).toMatch(/Missing columns/);
  });

  it("accepts flexible header aliases and Y/N flags", () => {
    const result = normalizeMenuRows([
      ["Category", "Item", "Variant", "Price Ground", "Price First", "Veg", "Needs Kitchen"],
      ["Noodles", "Chowmein", "Half", "90", "100", "yes", "no"],
    ]);
    expect(result.errors).toEqual([]);
    expect(result.groups[0]!.isVeg).toBe(true);
    expect(result.groups[0]!.needsKitchen).toBe(false);
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv([["a", 'b,c', 'say "hi"', "x\ny"]])).toBe('a,"b,c","say ""hi""","x\ny"\r\n');
  });
});
