import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { buscarTelefono, MODELO } from "./buscar";

// Cliente falso: devuelve las respuestas en orden y guarda los pedidos.
function clienteFalso(respuestas: Partial<Anthropic.Message>[]) {
  const pedidos: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const cliente = {
    messages: {
      create: async (pedido: Anthropic.MessageCreateParamsNonStreaming) => {
        pedidos.push(structuredClone(pedido));
        const respuesta = respuestas.shift();
        if (!respuesta) throw new Error("No hay más respuestas");
        return respuesta;
      },
    },
  } as unknown as Pick<Anthropic, "messages">;
  return { cliente, pedidos };
}

const EMPRESA = {
  empresa: "Senderos de la Costa S.A.",
  cuit: "30-71222454-8",
  localidad: "Mar del Plata",
  rubro: "Construcción",
};

const busqueda = { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "Senderos de la Costa S.A. Mar del Plata teléfono" } };

function registro(input: Record<string, string>) {
  return { type: "tool_use", id: "toolu_1", name: "registrar_telefono", input };
}

describe("buscarTelefono", () => {
  it("busca en la web desde la localidad de la empresa y lee el registro", async () => {
    const { cliente, pedidos } = clienteFalso([
      {
        stop_reason: "tool_use",
        content: [
          busqueda,
          registro({ telefono: "(0223) 495-1234", tipo: "comercial", fuente_url: "https://senderos.com.ar/contacto" }),
        ] as Anthropic.ContentBlock[],
      },
    ]);
    expect(await buscarTelefono(cliente, EMPRESA)).toEqual({
      telefono: "(0223) 495-1234",
      tipo: "comercial",
      fuenteUrl: "https://senderos.com.ar/contacto",
    });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({
      model: MODELO,
      tools: [
        {
          type: "web_search_20250305",
          max_uses: 3,
          user_location: { type: "approximate", city: "Mar del Plata", country: "AR" },
        },
        { name: "registrar_telefono", strict: true },
      ],
    });
  });

  it("si la API pausa la búsqueda, reenvía la respuesta tal cual para que siga", async () => {
    const pausada = { stop_reason: "pause_turn" as const, content: [busqueda] as Anthropic.ContentBlock[] };
    const { cliente, pedidos } = clienteFalso([
      pausada,
      {
        stop_reason: "tool_use",
        content: [registro({ telefono: "0223 4951234", tipo: "general", fuente_url: "https://senderos.com.ar" })] as Anthropic.ContentBlock[],
      },
    ]);
    expect(await buscarTelefono(cliente, EMPRESA)).toMatchObject({ telefono: "0223 4951234" });
    expect(pedidos[1].messages.at(-1)).toEqual({ role: "assistant", content: pausada.content });
  });

  it("si termina sin registrar, se lo pide una sola vez", async () => {
    const texto = [{ type: "text", text: "No encontré un teléfono publicado." }] as Anthropic.ContentBlock[];
    const { cliente, pedidos } = clienteFalso([
      { stop_reason: "end_turn", content: texto },
      { stop_reason: "end_turn", content: texto },
    ]);
    expect(await buscarTelefono(cliente, EMPRESA)).toBeNull();
    expect(pedidos).toHaveLength(2);
    expect(pedidos[1].messages.at(-1)).toMatchObject({ role: "user" });
  });

  it("no encontrado o rechazado: null", async () => {
    const noEncontrado = clienteFalso([
      {
        stop_reason: "tool_use",
        content: [registro({ telefono: "", tipo: "no_encontrado", fuente_url: "" })] as Anthropic.ContentBlock[],
      },
    ]);
    expect(await buscarTelefono(noEncontrado.cliente, EMPRESA)).toBeNull();

    const rechazado = clienteFalso([{ stop_reason: "refusal", content: [] }]);
    expect(await buscarTelefono(rechazado.cliente, EMPRESA)).toBeNull();
  });
});
