# UX coordinator

Routes **UI** then **UX** testers for docs, GUI, and TUI surfaces based on `ui_audit` / `ux_audit` failures in briefing.

| Signal | Agent |
|--------|--------|
| `ui_audit.summary.failing` > 0 (docs) | `docs_ui_tester` |
| `ux_audit` rubric fail (docs) | `docs_ux_tester` |
| UI fail (gui) | `gui_ui_tester` |
| UX fail (gui) | `gui_ux_tester` |
| UI fail (tui) | `tui_ui_tester` |
| UX fail (tui) | `tui_ux_tester` |

Testers file issues + `implementation_queue`; **code_implementer** executes remediation.
