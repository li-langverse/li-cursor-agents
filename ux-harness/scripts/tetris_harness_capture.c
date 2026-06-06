/* Tetris board frame capture for ux-harness — same palette as examples/tetris/tetris_rt.c. */
#include <SDL.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void color_rgb(int color, Uint8* r, Uint8* g, Uint8* b) {
  switch (color) {
    case 1:
      *r = 0;
      *g = 240;
      *b = 240;
      break;
    case 2:
      *r = 240;
      *g = 240;
      *b = 0;
      break;
    case 3:
      *r = 160;
      *g = 0;
      *b = 240;
      break;
    case 4:
      *r = 0;
      *g = 240;
      *b = 0;
      break;
    case 5:
      *r = 240;
      *g = 0;
      *b = 0;
      break;
    case 6:
      *r = 0;
      *g = 0;
      *b = 240;
      break;
    case 7:
      *r = 240;
      *g = 160;
      *b = 0;
      break;
    default:
      *r = 40;
      *g = 40;
      *b = 48;
      break;
  }
}

static void draw_cell(SDL_Renderer* r, int col, int row, int color, int cell_px) {
  const int pad = 1;
  SDL_Rect rect = {col * cell_px + pad, row * cell_px + pad, cell_px - pad * 2, cell_px - pad * 2};
  Uint8 rv = 0;
  Uint8 g = 0;
  Uint8 b = 0;
  color_rgb(color, &rv, &g, &b);
  SDL_SetRenderDrawColor(r, rv, g, b, 255);
  SDL_RenderFillRect(r, &rect);
}

static int save_ppm(SDL_Renderer* renderer, int w, int h, const char* path) {
  Uint32* pixels = (Uint32*)malloc((size_t)w * (size_t)h * sizeof(Uint32));
  if (!pixels) {
    return -1;
  }
  if (SDL_RenderReadPixels(renderer, NULL, SDL_PIXELFORMAT_ABGR8888, pixels, w * 4) != 0) {
    free(pixels);
    return -1;
  }
  FILE* f = fopen(path, "wb");
  if (!f) {
    free(pixels);
    return -1;
  }
  fprintf(f, "P6\n%d %d\n255\n", w, h);
  for (int y = 0; y < h; y++) {
    for (int x = 0; x < w; x++) {
      Uint32 p = pixels[y * w + x];
      Uint8 b = (Uint8)(p & 0xff);
      Uint8 g = (Uint8)((p >> 8) & 0xff);
      Uint8 rv = (Uint8)((p >> 16) & 0xff);
      fputc(rv, f);
      fputc(g, f);
      fputc(b, f);
    }
  }
  fclose(f);
  free(pixels);
  return 0;
}

static void draw_board(SDL_Renderer* r, int cell_px, int frame) {
  int board[200];
  memset(board, 0, sizeof(board));
  for (int col = 0; col < 10; col++) {
    board[19 * 10 + col] = (col % 7) + 1;
    board[18 * 10 + col] = ((col + 3) % 7) + 1;
  }

  SDL_SetRenderDrawColor(r, 12, 12, 18, 255);
  SDL_RenderClear(r);
  for (int row = 0; row < 20; row++) {
    for (int col = 0; col < 10; col++) {
      int color = board[row * 10 + col];
      if (color != 0) {
        draw_cell(r, col, row, color, cell_px);
      }
    }
  }
  int piece_col = 4 + (frame % 3);
  draw_cell(r, piece_col, 2, 2, cell_px);
  draw_cell(r, piece_col + 1, 2, 2, cell_px);
  draw_cell(r, piece_col, 3, 2, cell_px);
  draw_cell(r, piece_col + 1, 3, 2, cell_px);
  SDL_RenderPresent(r);
}

int main(int argc, char** argv) {
  const char* out_dir = ".";
  int frames = 3;
  const int width = 240;
  const int height = 480;
  const int cell_px = 24;

  for (int i = 1; i < argc; i++) {
    if (strcmp(argv[i], "--out") == 0 && i + 1 < argc) {
      out_dir = argv[++i];
    } else if (strcmp(argv[i], "--frames") == 0 && i + 1 < argc) {
      frames = atoi(argv[++i]);
    }
  }
  if (frames < 1) {
    frames = 1;
  }

  if (SDL_Init(SDL_INIT_VIDEO) != 0) {
    fprintf(stderr, "tetris-capture: SDL init failed: %s\n", SDL_GetError());
    return 2;
  }

  SDL_Window* window =
      SDL_CreateWindow("Li Tetris", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, width, height, 0);
  if (!window) {
    fprintf(stderr, "tetris-capture: window failed: %s\n", SDL_GetError());
    SDL_Quit();
    return 2;
  }
  SDL_Renderer* renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_ACCELERATED);
  if (!renderer) {
    fprintf(stderr, "tetris-capture: renderer failed: %s\n", SDL_GetError());
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 2;
  }

  for (int f = 0; f < frames; f++) {
    draw_board(renderer, cell_px, f);
    char path[512];
    snprintf(path, sizeof(path), "%s/frame-%03d.ppm", out_dir, f + 1);
    if (save_ppm(renderer, width, height, path) != 0) {
      fprintf(stderr, "tetris-capture: save failed: %s\n", path);
      SDL_DestroyRenderer(renderer);
      SDL_DestroyWindow(window);
      SDL_Quit();
      return 3;
    }
  }

  SDL_DestroyRenderer(renderer);
  SDL_DestroyWindow(window);
  SDL_Quit();
  return 0;
}
