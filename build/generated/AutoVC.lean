-- Auto-generated VC obligations (Phase 2e). Props typecheck in Lean; discharge in 2f.
import Init.Data.Float
import Core
import Discharge

open Li

namespace AutoVC

namespace main

def vc_main_requires_0 : Prop := True
theorem vc_main_requires_0_proved : vc_main_requires_0 := trivial
def vc_main_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_main_ensures_0_proved (result : Int) : vc_main_ensures_0 result := trivial
def vc_main_decreases_0 : Nat := 0
theorem vc_main_decreases_0_proved : vc_main_decreases_0 = 0 := rfl
def vc_main_call0_gui_panel_state_new_requires_0 : Prop := True
theorem vc_main_call0_gui_panel_state_new_requires_0_proved : vc_main_call0_gui_panel_state_new_requires_0 := trivial
def vc_main_call1_input_default_requires_0 : Prop := True
theorem vc_main_call1_input_default_requires_0_proved : vc_main_call1_input_default_requires_0 := trivial
/-! VC call-site requires (opaque): callee 'gui_handle_studio_key' at call 2 -/
def vc_main_call2_gui_handle_studio_key_requires_0 (panel : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_handle_studio_key' at call 2 -/
def vc_main_call2_gui_handle_studio_key_requires_1 (panel : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_handle_studio_key' at call 2 -/
def vc_main_call2_gui_handle_studio_key_requires_2 (panel : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_handle_studio_key' at call 2 -/
def vc_main_call2_gui_handle_studio_key_requires_3 (focus_viewport : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_handle_studio_key' at call 2 -/
def vc_main_call2_gui_handle_studio_key_requires_4 (focus_viewport : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_handle_studio_key' at call 2 -/
def vc_main_call2_gui_handle_studio_key_requires_5 (focus_viewport : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_handle_studio_key' at call 2 -/
def vc_main_call2_gui_handle_studio_key_requires_6 (focus_viewport : Int) : Prop := True
def vc_main_call2_gui_handle_studio_key_requires_7 : Prop := True
theorem vc_main_call2_gui_handle_studio_key_requires_7_proved : vc_main_call2_gui_handle_studio_key_requires_7 := trivial
def vc_main_call2_gui_handle_studio_key_requires_8 : Prop := True
theorem vc_main_call2_gui_handle_studio_key_requires_8_proved : vc_main_call2_gui_handle_studio_key_requires_8 := trivial
def vc_main_call3_studio_key_action_region_focus_requires_0 : Prop := True
theorem vc_main_call3_studio_key_action_region_focus_requires_0_proved : vc_main_call3_studio_key_action_region_focus_requires_0 := trivial
def vc_main_call4_studio_region_viewport_requires_0 : Prop := True
theorem vc_main_call4_studio_region_viewport_requires_0_proved : vc_main_call4_studio_region_viewport_requires_0 := trivial

end main

namespace li_std_gui_version

def vc_li_std_gui_version_requires_0 : Prop := True
theorem vc_li_std_gui_version_requires_0_proved : vc_li_std_gui_version_requires_0 := trivial
def vc_li_std_gui_version_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_li_std_gui_version_ensures_0_proved (result : Int) : vc_li_std_gui_version_ensures_0 result := trivial
def vc_li_std_gui_version_decreases_0 : Nat := 0
theorem vc_li_std_gui_version_decreases_0_proved : vc_li_std_gui_version_decreases_0 = 0 := rfl

end li_std_gui_version

namespace gui_panel_switch_budget_ms

def vc_gui_panel_switch_budget_ms_requires_0 : Prop := True
theorem vc_gui_panel_switch_budget_ms_requires_0_proved : vc_gui_panel_switch_budget_ms_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_panel_switch_budget_ms_ensures_0 (result : Float) : Prop := True
theorem vc_gui_panel_switch_budget_ms_ensures_0_proved (result : Float) : vc_gui_panel_switch_budget_ms_ensures_0 result := trivial
def vc_gui_panel_switch_budget_ms_decreases_0 : Nat := 0
theorem vc_gui_panel_switch_budget_ms_decreases_0_proved : vc_gui_panel_switch_budget_ms_decreases_0 = 0 := rfl
def vc_gui_panel_switch_budget_ms_call0_studio_panel_transition_ms_requires_0 : Prop := True
theorem vc_gui_panel_switch_budget_ms_call0_studio_panel_transition_ms_requires_0_proved : vc_gui_panel_switch_budget_ms_call0_studio_panel_transition_ms_requires_0 := trivial

end gui_panel_switch_budget_ms

namespace gui_viewport_selection_none

def vc_gui_viewport_selection_none_requires_0 : Prop := True
theorem vc_gui_viewport_selection_none_requires_0_proved : vc_gui_viewport_selection_none_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_viewport_selection_none_ensures_0 (result : Int) : Prop := True
theorem vc_gui_viewport_selection_none_ensures_0_proved (result : Int) : vc_gui_viewport_selection_none_ensures_0 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_viewport_selection_none_ensures_1 (result : Int) : Prop := True
theorem vc_gui_viewport_selection_none_ensures_1_proved (result : Int) : vc_gui_viewport_selection_none_ensures_1 result := trivial
def vc_gui_viewport_selection_none_decreases_0 : Nat := 0
theorem vc_gui_viewport_selection_none_decreases_0_proved : vc_gui_viewport_selection_none_decreases_0 = 0 := rfl
def vc_gui_viewport_selection_none_call0_rect_make_requires_0 : Prop := ((0 : Float) ≥ (0 : Float))
def vc_gui_viewport_selection_none_call0_rect_make_requires_1 : Prop := ((0 : Float) ≥ (0 : Float))

end gui_viewport_selection_none

namespace gui_viewport_selection_rect

def vc_gui_viewport_selection_rect_requires_0 (x : Float) (y : Float) (w : Float) (h : Float) : Prop := (w > (0 : Float))
def vc_gui_viewport_selection_rect_requires_1 (x : Float) (y : Float) (w : Float) (h : Float) : Prop := (h > (0 : Float))
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_viewport_selection_rect_ensures_0 (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_viewport_selection_rect_ensures_0_proved (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : vc_gui_viewport_selection_rect_ensures_0 x y w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_viewport_selection_rect_ensures_1 (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_viewport_selection_rect_ensures_1_proved (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : vc_gui_viewport_selection_rect_ensures_1 x y w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_viewport_selection_rect_ensures_2 (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_viewport_selection_rect_ensures_2_proved (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : vc_gui_viewport_selection_rect_ensures_2 x y w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_viewport_selection_rect_ensures_3 (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_viewport_selection_rect_ensures_3_proved (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : vc_gui_viewport_selection_rect_ensures_3 x y w h result := trivial
def vc_gui_viewport_selection_rect_decreases_0 (x : Float) (y : Float) (w : Float) (h : Float) : Nat := 0
theorem vc_gui_viewport_selection_rect_decreases_0_proved (x : Float) (y : Float) (w : Float) (h : Float) : vc_gui_viewport_selection_rect_decreases_0 x y w h = 0 := rfl
def vc_gui_viewport_selection_rect_call0_rect_make_requires_0 (x : Float) (y : Float) (w : Float) (h : Float) : Prop := (w ≥ (0 : Float))
def vc_gui_viewport_selection_rect_call0_rect_make_requires_1 (x : Float) (y : Float) (w : Float) (h : Float) : Prop := (h ≥ (0 : Float))

end gui_viewport_selection_rect

namespace gui_viewport_region_from_layout_with_selection

/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_viewport_region_from_layout_with_selection_requires_0 (layout : Int) (selection : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_with_selection_requires_0_proved (layout : Int) (selection : Int) : vc_gui_viewport_region_from_layout_with_selection_requires_0 layout selection := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_viewport_region_from_layout_with_selection_requires_1 (layout : Int) (selection : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_with_selection_requires_1_proved (layout : Int) (selection : Int) : vc_gui_viewport_region_from_layout_with_selection_requires_1 layout selection := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_viewport_region_from_layout_with_selection_requires_2 (layout : Int) (selection : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_with_selection_requires_2_proved (layout : Int) (selection : Int) : vc_gui_viewport_region_from_layout_with_selection_requires_2 layout selection := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_viewport_region_from_layout_with_selection_requires_3 (layout : Int) (selection : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_with_selection_requires_3_proved (layout : Int) (selection : Int) : vc_gui_viewport_region_from_layout_with_selection_requires_3 layout selection := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_viewport_region_from_layout_with_selection_ensures_0 (layout : Int) (selection : Int) (result : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_with_selection_ensures_0_proved (layout : Int) (selection : Int) (result : Int) : vc_gui_viewport_region_from_layout_with_selection_ensures_0 layout selection result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_viewport_region_from_layout_with_selection_ensures_1 (layout : Int) (selection : Int) (result : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_with_selection_ensures_1_proved (layout : Int) (selection : Int) (result : Int) : vc_gui_viewport_region_from_layout_with_selection_ensures_1 layout selection result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_viewport_region_from_layout_with_selection_ensures_2 (layout : Int) (selection : Int) (result : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_with_selection_ensures_2_proved (layout : Int) (selection : Int) (result : Int) : vc_gui_viewport_region_from_layout_with_selection_ensures_2 layout selection result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_viewport_region_from_layout_with_selection_ensures_3 (layout : Int) (selection : Int) (result : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_with_selection_ensures_3_proved (layout : Int) (selection : Int) (result : Int) : vc_gui_viewport_region_from_layout_with_selection_ensures_3 layout selection result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_viewport_region_from_layout_with_selection_ensures_4 (layout : Int) (selection : Int) (result : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_with_selection_ensures_4_proved (layout : Int) (selection : Int) (result : Int) : vc_gui_viewport_region_from_layout_with_selection_ensures_4 layout selection result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_viewport_region_from_layout_with_selection_ensures_5 (layout : Int) (selection : Int) (result : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_with_selection_ensures_5_proved (layout : Int) (selection : Int) (result : Int) : vc_gui_viewport_region_from_layout_with_selection_ensures_5 layout selection result := trivial
def vc_gui_viewport_region_from_layout_with_selection_decreases_0 (layout : Int) (selection : Int) : Nat := 0
theorem vc_gui_viewport_region_from_layout_with_selection_decreases_0_proved (layout : Int) (selection : Int) : vc_gui_viewport_region_from_layout_with_selection_decreases_0 layout selection = 0 := rfl

end gui_viewport_region_from_layout_with_selection

namespace gui_viewport_region_from_layout

/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_viewport_region_from_layout_requires_0 (layout : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_requires_0_proved (layout : Int) : vc_gui_viewport_region_from_layout_requires_0 layout := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_viewport_region_from_layout_requires_1 (layout : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_requires_1_proved (layout : Int) : vc_gui_viewport_region_from_layout_requires_1 layout := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_viewport_region_from_layout_ensures_0 (layout : Int) (result : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_ensures_0_proved (layout : Int) (result : Int) : vc_gui_viewport_region_from_layout_ensures_0 layout result := trivial
def vc_gui_viewport_region_from_layout_decreases_0 (layout : Int) : Nat := 0
theorem vc_gui_viewport_region_from_layout_decreases_0_proved (layout : Int) : vc_gui_viewport_region_from_layout_decreases_0 layout = 0 := rfl
/-! VC call-site requires (opaque): callee 'gui_viewport_region_from_layout_with_selection' at call 0 -/
def vc_gui_viewport_region_from_layout_call0_gui_viewport_region_from_layout_with_selection_requires_0 (layout : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_viewport_region_from_layout_with_selection' at call 0 -/
def vc_gui_viewport_region_from_layout_call0_gui_viewport_region_from_layout_with_selection_requires_1 (layout : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_viewport_region_from_layout_with_selection' at call 0 -/
def vc_gui_viewport_region_from_layout_call0_gui_viewport_region_from_layout_with_selection_requires_2 (layout : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_viewport_region_from_layout_with_selection' at call 0 -/
def vc_gui_viewport_region_from_layout_call0_gui_viewport_region_from_layout_with_selection_requires_3 (layout : Int) : Prop := True
def vc_gui_viewport_region_from_layout_call1_gui_viewport_selection_none_requires_0 (layout : Int) : Prop := True
theorem vc_gui_viewport_region_from_layout_call1_gui_viewport_selection_none_requires_0_proved (layout : Int) : vc_gui_viewport_region_from_layout_call1_gui_viewport_selection_none_requires_0 layout := trivial

end gui_viewport_region_from_layout

namespace gui_panel_switch_timing

def vc_gui_panel_switch_timing_requires_0 (from_region : Int) (to_region : Int) (elapsed_ms : Float) : Prop := (from_region ≥ 1)
def vc_gui_panel_switch_timing_requires_1 (from_region : Int) (to_region : Int) (elapsed_ms : Float) : Prop := (from_region ≤ 6)
def vc_gui_panel_switch_timing_requires_2 (from_region : Int) (to_region : Int) (elapsed_ms : Float) : Prop := (to_region ≥ 1)
def vc_gui_panel_switch_timing_requires_3 (from_region : Int) (to_region : Int) (elapsed_ms : Float) : Prop := (to_region ≤ 6)
def vc_gui_panel_switch_timing_requires_4 (from_region : Int) (to_region : Int) (elapsed_ms : Float) : Prop := (elapsed_ms ≥ (0 : Float))
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_panel_switch_timing_ensures_0 (from_region : Int) (to_region : Int) (elapsed_ms : Float) (result : Int) : Prop := True
theorem vc_gui_panel_switch_timing_ensures_0_proved (from_region : Int) (to_region : Int) (elapsed_ms : Float) (result : Int) : vc_gui_panel_switch_timing_ensures_0 from_region to_region elapsed_ms result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_panel_switch_timing_ensures_1 (from_region : Int) (to_region : Int) (elapsed_ms : Float) (result : Int) : Prop := True
theorem vc_gui_panel_switch_timing_ensures_1_proved (from_region : Int) (to_region : Int) (elapsed_ms : Float) (result : Int) : vc_gui_panel_switch_timing_ensures_1 from_region to_region elapsed_ms result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_panel_switch_timing_ensures_2 (from_region : Int) (to_region : Int) (elapsed_ms : Float) (result : Int) : Prop := True
theorem vc_gui_panel_switch_timing_ensures_2_proved (from_region : Int) (to_region : Int) (elapsed_ms : Float) (result : Int) : vc_gui_panel_switch_timing_ensures_2 from_region to_region elapsed_ms result := trivial
def vc_gui_panel_switch_timing_decreases_0 (from_region : Int) (to_region : Int) (elapsed_ms : Float) : Nat := 0
theorem vc_gui_panel_switch_timing_decreases_0_proved (from_region : Int) (to_region : Int) (elapsed_ms : Float) : vc_gui_panel_switch_timing_decreases_0 from_region to_region elapsed_ms = 0 := rfl
def vc_gui_panel_switch_timing_call0_gui_panel_switch_budget_ms_requires_0 (from_region : Int) (to_region : Int) (elapsed_ms : Float) : Prop := True
theorem vc_gui_panel_switch_timing_call0_gui_panel_switch_budget_ms_requires_0_proved (from_region : Int) (to_region : Int) (elapsed_ms : Float) : vc_gui_panel_switch_timing_call0_gui_panel_switch_budget_ms_requires_0 from_region to_region elapsed_ms := trivial

end gui_panel_switch_timing

namespace gui_panel_state_new

def vc_gui_panel_state_new_requires_0 : Prop := True
theorem vc_gui_panel_state_new_requires_0_proved : vc_gui_panel_state_new_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_panel_state_new_ensures_0 (result : Int) : Prop := True
theorem vc_gui_panel_state_new_ensures_0_proved (result : Int) : vc_gui_panel_state_new_ensures_0 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_panel_state_new_ensures_1 (result : Int) : Prop := True
theorem vc_gui_panel_state_new_ensures_1_proved (result : Int) : vc_gui_panel_state_new_ensures_1 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_panel_state_new_ensures_2 (result : Int) : Prop := True
theorem vc_gui_panel_state_new_ensures_2_proved (result : Int) : vc_gui_panel_state_new_ensures_2 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_panel_state_new_ensures_3 (result : Int) : Prop := True
theorem vc_gui_panel_state_new_ensures_3_proved (result : Int) : vc_gui_panel_state_new_ensures_3 result := trivial
def vc_gui_panel_state_new_decreases_0 : Nat := 0
theorem vc_gui_panel_state_new_decreases_0_proved : vc_gui_panel_state_new_decreases_0 = 0 := rfl
def vc_gui_panel_state_new_call0_studio_region_viewport_requires_0 : Prop := True
theorem vc_gui_panel_state_new_call0_studio_region_viewport_requires_0_proved : vc_gui_panel_state_new_call0_studio_region_viewport_requires_0 := trivial
def vc_gui_panel_state_new_call1_studio_palette_closed_flag_requires_0 : Prop := True
theorem vc_gui_panel_state_new_call1_studio_palette_closed_flag_requires_0_proved : vc_gui_panel_state_new_call1_studio_palette_closed_flag_requires_0 := trivial
def vc_gui_panel_state_new_call2_studio_palette_action_none_requires_0 : Prop := True
theorem vc_gui_panel_state_new_call2_studio_palette_action_none_requires_0_proved : vc_gui_panel_state_new_call2_studio_palette_action_none_requires_0 := trivial

end gui_panel_state_new

namespace gui_panel_switch_to

def vc_gui_panel_switch_to_requires_0 (state : Int) (region : Int) (elapsed_ms : Float) : Prop := (region ≥ 1)
def vc_gui_panel_switch_to_requires_1 (state : Int) (region : Int) (elapsed_ms : Float) : Prop := (region ≤ 6)
def vc_gui_panel_switch_to_requires_2 (state : Int) (region : Int) (elapsed_ms : Float) : Prop := (elapsed_ms ≥ (0 : Float))
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_panel_switch_to_requires_3 (state : Int) (region : Int) (elapsed_ms : Float) : Prop := True
theorem vc_gui_panel_switch_to_requires_3_proved (state : Int) (region : Int) (elapsed_ms : Float) : vc_gui_panel_switch_to_requires_3 state region elapsed_ms := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_panel_switch_to_ensures_0 (state : Int) (region : Int) (elapsed_ms : Float) (result : Int) : Prop := True
theorem vc_gui_panel_switch_to_ensures_0_proved (state : Int) (region : Int) (elapsed_ms : Float) (result : Int) : vc_gui_panel_switch_to_ensures_0 state region elapsed_ms result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_panel_switch_to_ensures_1 (state : Int) (region : Int) (elapsed_ms : Float) (result : Int) : Prop := True
theorem vc_gui_panel_switch_to_ensures_1_proved (state : Int) (region : Int) (elapsed_ms : Float) (result : Int) : vc_gui_panel_switch_to_ensures_1 state region elapsed_ms result := trivial
def vc_gui_panel_switch_to_decreases_0 (state : Int) (region : Int) (elapsed_ms : Float) : Nat := 0
theorem vc_gui_panel_switch_to_decreases_0_proved (state : Int) (region : Int) (elapsed_ms : Float) : vc_gui_panel_switch_to_decreases_0 state region elapsed_ms = 0 := rfl
def vc_gui_panel_switch_to_call0_gui_panel_switch_timing_requires_0 (state : Int) (region : Int) (elapsed_ms : Float) (from_region : Int) : Prop := (from_region ≥ 1)
def vc_gui_panel_switch_to_call0_gui_panel_switch_timing_requires_1 (state : Int) (region : Int) (elapsed_ms : Float) (from_region : Int) : Prop := (from_region ≤ 6)
def vc_gui_panel_switch_to_call0_gui_panel_switch_timing_requires_2 (state : Int) (region : Int) (elapsed_ms : Float) : Prop := (region ≥ 1)
def vc_gui_panel_switch_to_call0_gui_panel_switch_timing_requires_3 (state : Int) (region : Int) (elapsed_ms : Float) : Prop := (region ≤ 6)
def vc_gui_panel_switch_to_call0_gui_panel_switch_timing_requires_4 (state : Int) (region : Int) (elapsed_ms : Float) : Prop := (elapsed_ms ≥ (0 : Float))

end gui_panel_switch_to

namespace gui_panel_switch_within_budget

def vc_gui_panel_switch_within_budget_requires_0 (timing : Int) : Prop := True
theorem vc_gui_panel_switch_within_budget_requires_0_proved (timing : Int) : vc_gui_panel_switch_within_budget_requires_0 timing := trivial
def vc_gui_panel_switch_within_budget_ensures_0 (timing : Int) (result : Int) : Prop := (result ≥ 0)
def vc_gui_panel_switch_within_budget_ensures_1 (timing : Int) (result : Int) : Prop := (result ≤ 1)
def vc_gui_panel_switch_within_budget_decreases_0 (timing : Int) : Nat := 0
theorem vc_gui_panel_switch_within_budget_decreases_0_proved (timing : Int) : vc_gui_panel_switch_within_budget_decreases_0 timing = 0 := rfl

end gui_panel_switch_within_budget

namespace studio_key_action_none

def vc_studio_key_action_none_requires_0 : Prop := True
theorem vc_studio_key_action_none_requires_0_proved : vc_studio_key_action_none_requires_0 := trivial
def vc_studio_key_action_none_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_key_action_none_ensures_0_proved (result : Int) : vc_studio_key_action_none_ensures_0 result := trivial
def vc_studio_key_action_none_decreases_0 : Nat := 0
theorem vc_studio_key_action_none_decreases_0_proved : vc_studio_key_action_none_decreases_0 = 0 := rfl

end studio_key_action_none

namespace studio_key_action_palette_toggle

def vc_studio_key_action_palette_toggle_requires_0 : Prop := True
theorem vc_studio_key_action_palette_toggle_requires_0_proved : vc_studio_key_action_palette_toggle_requires_0 := trivial
def vc_studio_key_action_palette_toggle_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_key_action_palette_toggle_ensures_0_proved (result : Int) : vc_studio_key_action_palette_toggle_ensures_0 result := trivial
def vc_studio_key_action_palette_toggle_decreases_0 : Nat := 0
theorem vc_studio_key_action_palette_toggle_decreases_0_proved : vc_studio_key_action_palette_toggle_decreases_0 = 0 := rfl

end studio_key_action_palette_toggle

namespace studio_key_action_palette_close

def vc_studio_key_action_palette_close_requires_0 : Prop := True
theorem vc_studio_key_action_palette_close_requires_0_proved : vc_studio_key_action_palette_close_requires_0 := trivial
def vc_studio_key_action_palette_close_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_key_action_palette_close_ensures_0_proved (result : Int) : vc_studio_key_action_palette_close_ensures_0 result := trivial
def vc_studio_key_action_palette_close_decreases_0 : Nat := 0
theorem vc_studio_key_action_palette_close_decreases_0_proved : vc_studio_key_action_palette_close_decreases_0 = 0 := rfl

end studio_key_action_palette_close

namespace studio_key_action_region_focus

def vc_studio_key_action_region_focus_requires_0 : Prop := True
theorem vc_studio_key_action_region_focus_requires_0_proved : vc_studio_key_action_region_focus_requires_0 := trivial
def vc_studio_key_action_region_focus_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_key_action_region_focus_ensures_0_proved (result : Int) : vc_studio_key_action_region_focus_ensures_0 result := trivial
def vc_studio_key_action_region_focus_decreases_0 : Nat := 0
theorem vc_studio_key_action_region_focus_decreases_0_proved : vc_studio_key_action_region_focus_decreases_0 = 0 := rfl

end studio_key_action_region_focus

namespace studio_key_action_palette_exec

def vc_studio_key_action_palette_exec_requires_0 : Prop := True
theorem vc_studio_key_action_palette_exec_requires_0_proved : vc_studio_key_action_palette_exec_requires_0 := trivial
def vc_studio_key_action_palette_exec_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_key_action_palette_exec_ensures_0_proved (result : Int) : vc_studio_key_action_palette_exec_ensures_0 result := trivial
def vc_studio_key_action_palette_exec_decreases_0 : Nat := 0
theorem vc_studio_key_action_palette_exec_decreases_0_proved : vc_studio_key_action_palette_exec_decreases_0 = 0 := rfl

end studio_key_action_palette_exec

namespace studio_key_binding_escape

def vc_studio_key_binding_escape_requires_0 : Prop := True
theorem vc_studio_key_binding_escape_requires_0_proved : vc_studio_key_binding_escape_requires_0 := trivial
def vc_studio_key_binding_escape_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_key_binding_escape_ensures_0_proved (result : Int) : vc_studio_key_binding_escape_ensures_0 result := trivial
def vc_studio_key_binding_escape_decreases_0 : Nat := 0
theorem vc_studio_key_binding_escape_decreases_0_proved : vc_studio_key_binding_escape_decreases_0 = 0 := rfl

end studio_key_binding_escape

namespace studio_key_binding_cmd_k

def vc_studio_key_binding_cmd_k_requires_0 : Prop := True
theorem vc_studio_key_binding_cmd_k_requires_0_proved : vc_studio_key_binding_cmd_k_requires_0 := trivial
def vc_studio_key_binding_cmd_k_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_key_binding_cmd_k_ensures_0_proved (result : Int) : vc_studio_key_binding_cmd_k_ensures_0 result := trivial
def vc_studio_key_binding_cmd_k_decreases_0 : Nat := 0
theorem vc_studio_key_binding_cmd_k_decreases_0_proved : vc_studio_key_binding_cmd_k_decreases_0 = 0 := rfl

end studio_key_binding_cmd_k

namespace studio_key_binding_digit_dock

def vc_studio_key_binding_digit_dock_requires_0 : Prop := True
theorem vc_studio_key_binding_digit_dock_requires_0_proved : vc_studio_key_binding_digit_dock_requires_0 := trivial
def vc_studio_key_binding_digit_dock_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_key_binding_digit_dock_ensures_0_proved (result : Int) : vc_studio_key_binding_digit_dock_ensures_0 result := trivial
def vc_studio_key_binding_digit_dock_decreases_0 : Nat := 0
theorem vc_studio_key_binding_digit_dock_decreases_0_proved : vc_studio_key_binding_digit_dock_decreases_0 = 0 := rfl

end studio_key_binding_digit_dock

namespace studio_key_binding_digit_viewport

def vc_studio_key_binding_digit_viewport_requires_0 : Prop := True
theorem vc_studio_key_binding_digit_viewport_requires_0_proved : vc_studio_key_binding_digit_viewport_requires_0 := trivial
def vc_studio_key_binding_digit_viewport_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_key_binding_digit_viewport_ensures_0_proved (result : Int) : vc_studio_key_binding_digit_viewport_ensures_0 result := trivial
def vc_studio_key_binding_digit_viewport_decreases_0 : Nat := 0
theorem vc_studio_key_binding_digit_viewport_decreases_0_proved : vc_studio_key_binding_digit_viewport_decreases_0 = 0 := rfl

end studio_key_binding_digit_viewport

namespace studio_key_binding_digit_inspector

def vc_studio_key_binding_digit_inspector_requires_0 : Prop := True
theorem vc_studio_key_binding_digit_inspector_requires_0_proved : vc_studio_key_binding_digit_inspector_requires_0 := trivial
def vc_studio_key_binding_digit_inspector_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_key_binding_digit_inspector_ensures_0_proved (result : Int) : vc_studio_key_binding_digit_inspector_ensures_0 result := trivial
def vc_studio_key_binding_digit_inspector_decreases_0 : Nat := 0
theorem vc_studio_key_binding_digit_inspector_decreases_0_proved : vc_studio_key_binding_digit_inspector_decreases_0 = 0 := rfl

end studio_key_binding_digit_inspector

namespace studio_key_binding_digit_timeline

def vc_studio_key_binding_digit_timeline_requires_0 : Prop := True
theorem vc_studio_key_binding_digit_timeline_requires_0_proved : vc_studio_key_binding_digit_timeline_requires_0 := trivial
def vc_studio_key_binding_digit_timeline_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_key_binding_digit_timeline_ensures_0_proved (result : Int) : vc_studio_key_binding_digit_timeline_ensures_0 result := trivial
def vc_studio_key_binding_digit_timeline_decreases_0 : Nat := 0
theorem vc_studio_key_binding_digit_timeline_decreases_0_proved : vc_studio_key_binding_digit_timeline_decreases_0 = 0 := rfl

end studio_key_binding_digit_timeline

namespace studio_key_binding_digit_agent

def vc_studio_key_binding_digit_agent_requires_0 : Prop := True
theorem vc_studio_key_binding_digit_agent_requires_0_proved : vc_studio_key_binding_digit_agent_requires_0 := trivial
def vc_studio_key_binding_digit_agent_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_key_binding_digit_agent_ensures_0_proved (result : Int) : vc_studio_key_binding_digit_agent_ensures_0 result := trivial
def vc_studio_key_binding_digit_agent_decreases_0 : Nat := 0
theorem vc_studio_key_binding_digit_agent_decreases_0_proved : vc_studio_key_binding_digit_agent_decreases_0 = 0 := rfl

end studio_key_binding_digit_agent

namespace gui_studio_key_binding

/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_key_binding_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_requires_0 binding_id := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_key_binding_requires_1 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_requires_1_proved (binding_id : Int) : vc_gui_studio_key_binding_requires_1 binding_id := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_key_binding_ensures_0 (binding_id : Int) (result : Int) : Prop := True
theorem vc_gui_studio_key_binding_ensures_0_proved (binding_id : Int) (result : Int) : vc_gui_studio_key_binding_ensures_0 binding_id result := trivial
def vc_gui_studio_key_binding_decreases_0 (binding_id : Int) : Nat := Int.toNat binding_id
theorem vc_gui_studio_key_binding_decreases_0_proved (binding_id : Int) : vc_gui_studio_key_binding_decreases_0 binding_id = Int.toNat binding_id := rfl
def vc_gui_studio_key_binding_call0_studio_key_action_none_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call0_studio_key_action_none_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call0_studio_key_action_none_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call1_studio_key_binding_escape_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call1_studio_key_binding_escape_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call1_studio_key_binding_escape_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call2_studio_key_action_palette_close_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call2_studio_key_action_palette_close_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call2_studio_key_action_palette_close_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call3_studio_key_binding_cmd_k_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call3_studio_key_binding_cmd_k_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call3_studio_key_binding_cmd_k_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call4_studio_key_action_palette_toggle_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call4_studio_key_action_palette_toggle_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call4_studio_key_action_palette_toggle_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call5_studio_key_binding_digit_dock_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call5_studio_key_binding_digit_dock_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call5_studio_key_binding_digit_dock_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call6_studio_region_dock_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call6_studio_region_dock_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call6_studio_region_dock_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call7_studio_key_action_region_focus_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call7_studio_key_action_region_focus_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call7_studio_key_action_region_focus_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call8_studio_key_binding_digit_viewport_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call8_studio_key_binding_digit_viewport_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call8_studio_key_binding_digit_viewport_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call9_studio_region_viewport_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call9_studio_region_viewport_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call9_studio_region_viewport_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call10_studio_key_action_region_focus_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call10_studio_key_action_region_focus_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call10_studio_key_action_region_focus_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call11_studio_key_binding_digit_inspector_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call11_studio_key_binding_digit_inspector_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call11_studio_key_binding_digit_inspector_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call12_studio_region_inspector_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call12_studio_region_inspector_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call12_studio_region_inspector_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call13_studio_key_action_region_focus_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call13_studio_key_action_region_focus_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call13_studio_key_action_region_focus_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call14_studio_key_binding_digit_timeline_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call14_studio_key_binding_digit_timeline_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call14_studio_key_binding_digit_timeline_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call15_studio_region_timeline_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call15_studio_region_timeline_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call15_studio_region_timeline_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call16_studio_key_action_region_focus_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call16_studio_key_action_region_focus_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call16_studio_key_action_region_focus_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call17_studio_key_binding_digit_agent_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call17_studio_key_binding_digit_agent_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call17_studio_key_binding_digit_agent_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call18_studio_region_agent_strip_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call18_studio_region_agent_strip_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call18_studio_region_agent_strip_requires_0 binding_id := trivial
def vc_gui_studio_key_binding_call19_studio_key_action_region_focus_requires_0 (binding_id : Int) : Prop := True
theorem vc_gui_studio_key_binding_call19_studio_key_action_region_focus_requires_0_proved (binding_id : Int) : vc_gui_studio_key_binding_call19_studio_key_action_region_focus_requires_0 binding_id := trivial

end gui_studio_key_binding

namespace gui_studio_region_from_focus_digit

def vc_gui_studio_region_from_focus_digit_requires_0 (digit : Int) : Prop := (digit ≥ 0)
def vc_gui_studio_region_from_focus_digit_requires_1 (digit : Int) : Prop := (digit ≤ 5)
def vc_gui_studio_region_from_focus_digit_ensures_0 (digit : Int) (result : Int) : Prop := (result ≥ 0)
def vc_gui_studio_region_from_focus_digit_ensures_1 (digit : Int) (result : Int) : Prop := (result ≤ 6)
def vc_gui_studio_region_from_focus_digit_decreases_0 (digit : Int) : Nat := Int.toNat digit
theorem vc_gui_studio_region_from_focus_digit_decreases_0_proved (digit : Int) : vc_gui_studio_region_from_focus_digit_decreases_0 digit = Int.toNat digit := rfl
def vc_gui_studio_region_from_focus_digit_call0_studio_region_dock_requires_0 (digit : Int) : Prop := True
theorem vc_gui_studio_region_from_focus_digit_call0_studio_region_dock_requires_0_proved (digit : Int) : vc_gui_studio_region_from_focus_digit_call0_studio_region_dock_requires_0 digit := trivial
def vc_gui_studio_region_from_focus_digit_call1_studio_region_viewport_requires_0 (digit : Int) : Prop := True
theorem vc_gui_studio_region_from_focus_digit_call1_studio_region_viewport_requires_0_proved (digit : Int) : vc_gui_studio_region_from_focus_digit_call1_studio_region_viewport_requires_0 digit := trivial
def vc_gui_studio_region_from_focus_digit_call2_studio_region_inspector_requires_0 (digit : Int) : Prop := True
theorem vc_gui_studio_region_from_focus_digit_call2_studio_region_inspector_requires_0_proved (digit : Int) : vc_gui_studio_region_from_focus_digit_call2_studio_region_inspector_requires_0 digit := trivial
def vc_gui_studio_region_from_focus_digit_call3_studio_region_timeline_requires_0 (digit : Int) : Prop := True
theorem vc_gui_studio_region_from_focus_digit_call3_studio_region_timeline_requires_0_proved (digit : Int) : vc_gui_studio_region_from_focus_digit_call3_studio_region_timeline_requires_0 digit := trivial
def vc_gui_studio_region_from_focus_digit_call4_studio_region_agent_strip_requires_0 (digit : Int) : Prop := True
theorem vc_gui_studio_region_from_focus_digit_call4_studio_region_agent_strip_requires_0_proved (digit : Int) : vc_gui_studio_region_from_focus_digit_call4_studio_region_agent_strip_requires_0 digit := trivial

end gui_studio_region_from_focus_digit

namespace gui_studio_palette_close

/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_close_requires_0 (panel : Int) : Prop := True
theorem vc_gui_studio_palette_close_requires_0_proved (panel : Int) : vc_gui_studio_palette_close_requires_0 panel := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_close_requires_1 (panel : Int) : Prop := True
theorem vc_gui_studio_palette_close_requires_1_proved (panel : Int) : vc_gui_studio_palette_close_requires_1 panel := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_close_ensures_0 (panel : Int) (result : Int) : Prop := True
theorem vc_gui_studio_palette_close_ensures_0_proved (panel : Int) (result : Int) : vc_gui_studio_palette_close_ensures_0 panel result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_close_ensures_1 (panel : Int) (result : Int) : Prop := True
theorem vc_gui_studio_palette_close_ensures_1_proved (panel : Int) (result : Int) : vc_gui_studio_palette_close_ensures_1 panel result := trivial
def vc_gui_studio_palette_close_decreases_0 (panel : Int) : Nat := 0
theorem vc_gui_studio_palette_close_decreases_0_proved (panel : Int) : vc_gui_studio_palette_close_decreases_0 panel = 0 := rfl
def vc_gui_studio_palette_close_call0_studio_palette_closed_flag_requires_0 (panel : Int) : Prop := True
theorem vc_gui_studio_palette_close_call0_studio_palette_closed_flag_requires_0_proved (panel : Int) : vc_gui_studio_palette_close_call0_studio_palette_closed_flag_requires_0 panel := trivial
def vc_gui_studio_palette_close_call1_studio_key_action_palette_close_requires_0 (panel : Int) : Prop := True
theorem vc_gui_studio_palette_close_call1_studio_key_action_palette_close_requires_0_proved (panel : Int) : vc_gui_studio_palette_close_call1_studio_key_action_palette_close_requires_0 panel := trivial

end gui_studio_palette_close

namespace gui_studio_palette_toggle

/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_requires_0 (panel : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_requires_0_proved (panel : Int) : vc_gui_studio_palette_toggle_requires_0 panel := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_requires_1 (panel : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_requires_1_proved (panel : Int) : vc_gui_studio_palette_toggle_requires_1 panel := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_ensures_0 (panel : Int) (result : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_ensures_0_proved (panel : Int) (result : Int) : vc_gui_studio_palette_toggle_ensures_0 panel result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_ensures_1 (panel : Int) (result : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_ensures_1_proved (panel : Int) (result : Int) : vc_gui_studio_palette_toggle_ensures_1 panel result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_ensures_2 (panel : Int) (result : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_ensures_2_proved (panel : Int) (result : Int) : vc_gui_studio_palette_toggle_ensures_2 panel result := trivial
def vc_gui_studio_palette_toggle_decreases_0 (panel : Int) : Nat := 0
theorem vc_gui_studio_palette_toggle_decreases_0_proved (panel : Int) : vc_gui_studio_palette_toggle_decreases_0 panel = 0 := rfl
def vc_gui_studio_palette_toggle_call0_studio_palette_open_flag_requires_0 (panel : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_call0_studio_palette_open_flag_requires_0_proved (panel : Int) : vc_gui_studio_palette_toggle_call0_studio_palette_open_flag_requires_0 panel := trivial
def vc_gui_studio_palette_toggle_call1_studio_palette_closed_flag_requires_0 (panel : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_call1_studio_palette_closed_flag_requires_0_proved (panel : Int) : vc_gui_studio_palette_toggle_call1_studio_palette_closed_flag_requires_0 panel := trivial
def vc_gui_studio_palette_toggle_call2_studio_key_action_palette_toggle_requires_0 (panel : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_call2_studio_key_action_palette_toggle_requires_0_proved (panel : Int) : vc_gui_studio_palette_toggle_call2_studio_key_action_palette_toggle_requires_0 panel := trivial
def vc_gui_studio_palette_toggle_call3_studio_palette_open_flag_requires_0 (panel : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_call3_studio_palette_open_flag_requires_0_proved (panel : Int) : vc_gui_studio_palette_toggle_call3_studio_palette_open_flag_requires_0 panel := trivial
def vc_gui_studio_palette_toggle_call4_studio_key_action_palette_toggle_requires_0 (panel : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_call4_studio_key_action_palette_toggle_requires_0_proved (panel : Int) : vc_gui_studio_palette_toggle_call4_studio_key_action_palette_toggle_requires_0 panel := trivial

end gui_studio_palette_toggle

namespace gui_studio_palette_close_compose

/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_close_compose_requires_0 (panel : Int) (palette : Int) : Prop := True
theorem vc_gui_studio_palette_close_compose_requires_0_proved (panel : Int) (palette : Int) : vc_gui_studio_palette_close_compose_requires_0 panel palette := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_close_compose_requires_1 (panel : Int) (palette : Int) : Prop := True
theorem vc_gui_studio_palette_close_compose_requires_1_proved (panel : Int) (palette : Int) : vc_gui_studio_palette_close_compose_requires_1 panel palette := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_close_compose_requires_2 (panel : Int) (palette : Int) : Prop := True
theorem vc_gui_studio_palette_close_compose_requires_2_proved (panel : Int) (palette : Int) : vc_gui_studio_palette_close_compose_requires_2 panel palette := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_close_compose_ensures_0 (panel : Int) (palette : Int) (result : Int) : Prop := True
theorem vc_gui_studio_palette_close_compose_ensures_0_proved (panel : Int) (palette : Int) (result : Int) : vc_gui_studio_palette_close_compose_ensures_0 panel palette result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_close_compose_ensures_1 (panel : Int) (palette : Int) (result : Int) : Prop := True
theorem vc_gui_studio_palette_close_compose_ensures_1_proved (panel : Int) (palette : Int) (result : Int) : vc_gui_studio_palette_close_compose_ensures_1 panel palette result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_close_compose_ensures_2 (panel : Int) (palette : Int) (result : Int) : Prop := True
theorem vc_gui_studio_palette_close_compose_ensures_2_proved (panel : Int) (palette : Int) (result : Int) : vc_gui_studio_palette_close_compose_ensures_2 panel palette result := trivial
def vc_gui_studio_palette_close_compose_decreases_0 (panel : Int) (palette : Int) : Nat := 0
theorem vc_gui_studio_palette_close_compose_decreases_0_proved (panel : Int) (palette : Int) : vc_gui_studio_palette_close_compose_decreases_0 panel palette = 0 := rfl
/-! VC call-site requires (opaque): callee 'studio_palette_close' at call 0 -/
def vc_gui_studio_palette_close_compose_call0_studio_palette_close_requires_0 (panel : Int) (palette : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_palette_close' at call 1 -/
def vc_gui_studio_palette_close_compose_call1_gui_studio_palette_close_requires_0 (panel : Int) (palette : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_palette_close' at call 1 -/
def vc_gui_studio_palette_close_compose_call1_gui_studio_palette_close_requires_1 (panel : Int) (palette : Int) : Prop := True

end gui_studio_palette_close_compose

namespace gui_studio_palette_toggle_compose

def vc_gui_studio_palette_toggle_compose_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) : Prop := (w > (0 : Float))
def vc_gui_studio_palette_toggle_compose_requires_1 (panel : Int) (palette : Int) (w : Float) (h : Float) : Prop := (h > (0 : Float))
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_compose_requires_2 (panel : Int) (palette : Int) (w : Float) (h : Float) : Prop := True
theorem vc_gui_studio_palette_toggle_compose_requires_2_proved (panel : Int) (palette : Int) (w : Float) (h : Float) : vc_gui_studio_palette_toggle_compose_requires_2 panel palette w h := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_compose_requires_3 (panel : Int) (palette : Int) (w : Float) (h : Float) : Prop := True
theorem vc_gui_studio_palette_toggle_compose_requires_3_proved (panel : Int) (palette : Int) (w : Float) (h : Float) : vc_gui_studio_palette_toggle_compose_requires_3 panel palette w h := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_compose_requires_4 (panel : Int) (palette : Int) (w : Float) (h : Float) : Prop := True
theorem vc_gui_studio_palette_toggle_compose_requires_4_proved (panel : Int) (palette : Int) (w : Float) (h : Float) : vc_gui_studio_palette_toggle_compose_requires_4 panel palette w h := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_compose_requires_5 (panel : Int) (palette : Int) (w : Float) (h : Float) : Prop := True
theorem vc_gui_studio_palette_toggle_compose_requires_5_proved (panel : Int) (palette : Int) (w : Float) (h : Float) : vc_gui_studio_palette_toggle_compose_requires_5 panel palette w h := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_compose_ensures_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_compose_ensures_0_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (result : Int) : vc_gui_studio_palette_toggle_compose_ensures_0 panel palette w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_compose_ensures_1 (panel : Int) (palette : Int) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_compose_ensures_1_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (result : Int) : vc_gui_studio_palette_toggle_compose_ensures_1 panel palette w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_compose_ensures_2 (panel : Int) (palette : Int) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_compose_ensures_2_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (result : Int) : vc_gui_studio_palette_toggle_compose_ensures_2 panel palette w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_compose_ensures_3 (panel : Int) (palette : Int) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_compose_ensures_3_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (result : Int) : vc_gui_studio_palette_toggle_compose_ensures_3 panel palette w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_toggle_compose_ensures_4 (panel : Int) (palette : Int) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_studio_palette_toggle_compose_ensures_4_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (result : Int) : vc_gui_studio_palette_toggle_compose_ensures_4 panel palette w h result := trivial
def vc_gui_studio_palette_toggle_compose_decreases_0 (panel : Int) (palette : Int) (w : Float) (h : Float) : Nat := 0
theorem vc_gui_studio_palette_toggle_compose_decreases_0_proved (panel : Int) (palette : Int) (w : Float) (h : Float) : vc_gui_studio_palette_toggle_compose_decreases_0 panel palette w h = 0 := rfl
def vc_gui_studio_palette_toggle_compose_call0_studio_palette_toggle_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (toggle_w : Float) : Prop := (toggle_w > (0 : Float))
def vc_gui_studio_palette_toggle_compose_call0_studio_palette_toggle_requires_1 (panel : Int) (palette : Int) (w : Float) (h : Float) (toggle_h : Float) : Prop := (toggle_h > (0 : Float))
/-! VC call-site requires (opaque): callee 'studio_palette_toggle' at call 0 -/
def vc_gui_studio_palette_toggle_compose_call0_studio_palette_toggle_requires_2 (panel : Int) (palette : Int) (w : Float) (h : Float) : Prop := True
/-! VC call-site requires (opaque): callee 'studio_palette_toggle' at call 0 -/
def vc_gui_studio_palette_toggle_compose_call0_studio_palette_toggle_requires_3 (panel : Int) (palette : Int) (w : Float) (h : Float) : Prop := True
def vc_gui_studio_palette_toggle_compose_call1_studio_key_action_palette_toggle_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) : Prop := True
theorem vc_gui_studio_palette_toggle_compose_call1_studio_key_action_palette_toggle_requires_0_proved (panel : Int) (palette : Int) (w : Float) (h : Float) : vc_gui_studio_palette_toggle_compose_call1_studio_key_action_palette_toggle_requires_0 panel palette w h := trivial

end gui_studio_palette_toggle_compose

namespace gui_studio_palette_exec_compose

def vc_gui_studio_palette_exec_compose_requires_0 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : Prop := (w > (0 : Float))
def vc_gui_studio_palette_exec_compose_requires_1 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : Prop := (h > (0 : Float))
def vc_gui_studio_palette_exec_compose_requires_2 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : Prop := (slot ≥ 1)
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_exec_compose_requires_3 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : Prop := True
theorem vc_gui_studio_palette_exec_compose_requires_3_proved (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : vc_gui_studio_palette_exec_compose_requires_3 panel palette slot w h := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_exec_compose_requires_4 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : Prop := True
theorem vc_gui_studio_palette_exec_compose_requires_4_proved (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : vc_gui_studio_palette_exec_compose_requires_4 panel palette slot w h := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_exec_compose_ensures_0 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_studio_palette_exec_compose_ensures_0_proved (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) (result : Int) : vc_gui_studio_palette_exec_compose_ensures_0 panel palette slot w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_exec_compose_ensures_1 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_studio_palette_exec_compose_ensures_1_proved (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) (result : Int) : vc_gui_studio_palette_exec_compose_ensures_1 panel palette slot w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_exec_compose_ensures_2 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_studio_palette_exec_compose_ensures_2_proved (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) (result : Int) : vc_gui_studio_palette_exec_compose_ensures_2 panel palette slot w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_palette_exec_compose_ensures_3 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_studio_palette_exec_compose_ensures_3_proved (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) (result : Int) : vc_gui_studio_palette_exec_compose_ensures_3 panel palette slot w h result := trivial
def vc_gui_studio_palette_exec_compose_decreases_0 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : Nat := Int.toNat slot
theorem vc_gui_studio_palette_exec_compose_decreases_0_proved (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : vc_gui_studio_palette_exec_compose_decreases_0 panel palette slot w h = Int.toNat slot := rfl
def vc_gui_studio_palette_exec_compose_call0_studio_palette_exec_slot_requires_0 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : Prop := (slot ≥ 1)
/-! VC call-site requires (opaque): callee 'studio_palette_exec_slot' at call 0 -/
def vc_gui_studio_palette_exec_compose_call0_studio_palette_exec_slot_requires_1 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : Prop := True
/-! VC call-site requires (opaque): callee 'studio_palette_exec_slot' at call 0 -/
def vc_gui_studio_palette_exec_compose_call0_studio_palette_exec_slot_requires_2 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : Prop := True
def vc_gui_studio_palette_exec_compose_call1_studio_palette_closed_flag_requires_0 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : Prop := True
theorem vc_gui_studio_palette_exec_compose_call1_studio_palette_closed_flag_requires_0_proved (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : vc_gui_studio_palette_exec_compose_call1_studio_palette_closed_flag_requires_0 panel palette slot w h := trivial
def vc_gui_studio_palette_exec_compose_call2_studio_key_action_palette_exec_requires_0 (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : Prop := True
theorem vc_gui_studio_palette_exec_compose_call2_studio_key_action_palette_exec_requires_0_proved (panel : Int) (palette : Int) (slot : Int) (w : Float) (h : Float) : vc_gui_studio_palette_exec_compose_call2_studio_key_action_palette_exec_requires_0 panel palette slot w h := trivial

end gui_studio_palette_exec_compose

namespace gui_studio_palette_region_for_action

/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_region_for_action_requires_0 (action_id : Int) : Prop := True
theorem vc_gui_studio_palette_region_for_action_requires_0_proved (action_id : Int) : vc_gui_studio_palette_region_for_action_requires_0 action_id := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_studio_palette_region_for_action_requires_1 (action_id : Int) : Prop := True
theorem vc_gui_studio_palette_region_for_action_requires_1_proved (action_id : Int) : vc_gui_studio_palette_region_for_action_requires_1 action_id := trivial
def vc_gui_studio_palette_region_for_action_ensures_0 (action_id : Int) (result : Int) : Prop := (result ≥ 0)
def vc_gui_studio_palette_region_for_action_ensures_1 (action_id : Int) (result : Int) : Prop := (result ≤ 6)
def vc_gui_studio_palette_region_for_action_decreases_0 (action_id : Int) : Nat := Int.toNat action_id
theorem vc_gui_studio_palette_region_for_action_decreases_0_proved (action_id : Int) : vc_gui_studio_palette_region_for_action_decreases_0 action_id = Int.toNat action_id := rfl
def vc_gui_studio_palette_region_for_action_call0_studio_palette_action_focus_inspector_requires_0 (action_id : Int) : Prop := True
theorem vc_gui_studio_palette_region_for_action_call0_studio_palette_action_focus_inspector_requires_0_proved (action_id : Int) : vc_gui_studio_palette_region_for_action_call0_studio_palette_action_focus_inspector_requires_0 action_id := trivial
def vc_gui_studio_palette_region_for_action_call1_studio_region_inspector_requires_0 (action_id : Int) : Prop := True
theorem vc_gui_studio_palette_region_for_action_call1_studio_region_inspector_requires_0_proved (action_id : Int) : vc_gui_studio_palette_region_for_action_call1_studio_region_inspector_requires_0 action_id := trivial
def vc_gui_studio_palette_region_for_action_call2_studio_palette_action_focus_timeline_requires_0 (action_id : Int) : Prop := True
theorem vc_gui_studio_palette_region_for_action_call2_studio_palette_action_focus_timeline_requires_0_proved (action_id : Int) : vc_gui_studio_palette_region_for_action_call2_studio_palette_action_focus_timeline_requires_0 action_id := trivial
def vc_gui_studio_palette_region_for_action_call3_studio_region_timeline_requires_0 (action_id : Int) : Prop := True
theorem vc_gui_studio_palette_region_for_action_call3_studio_region_timeline_requires_0_proved (action_id : Int) : vc_gui_studio_palette_region_for_action_call3_studio_region_timeline_requires_0 action_id := trivial
def vc_gui_studio_palette_region_for_action_call4_studio_palette_action_focus_agent_requires_0 (action_id : Int) : Prop := True
theorem vc_gui_studio_palette_region_for_action_call4_studio_palette_action_focus_agent_requires_0_proved (action_id : Int) : vc_gui_studio_palette_region_for_action_call4_studio_palette_action_focus_agent_requires_0 action_id := trivial
def vc_gui_studio_palette_region_for_action_call5_studio_region_agent_strip_requires_0 (action_id : Int) : Prop := True
theorem vc_gui_studio_palette_region_for_action_call5_studio_region_agent_strip_requires_0_proved (action_id : Int) : vc_gui_studio_palette_region_for_action_call5_studio_region_agent_strip_requires_0 action_id := trivial

end gui_studio_palette_region_for_action

namespace gui_handle_studio_key_palette

def vc_gui_handle_studio_key_palette_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := (w > (0 : Float))
def vc_gui_handle_studio_key_palette_requires_1 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := (h > (0 : Float))
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_palette_requires_2 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_requires_2_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_requires_2 panel palette w h input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_palette_requires_3 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_requires_3_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_requires_3 panel palette w h input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_palette_requires_4 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_requires_4_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_requires_4 panel palette w h input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_palette_requires_5 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_requires_5_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_requires_5 panel palette w h input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_palette_requires_6 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_requires_6_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_requires_6 panel palette w h input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_palette_requires_7 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_requires_7_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_requires_7 panel palette w h input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_palette_requires_8 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_requires_8_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_requires_8 panel palette w h input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_palette_requires_9 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_requires_9_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_requires_9 panel palette w h input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_palette_requires_10 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_requires_10_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_requires_10 panel palette w h input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_palette_requires_11 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_requires_11_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_requires_11 panel palette w h input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_palette_requires_12 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_requires_12_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_requires_12 panel palette w h input := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_palette_ensures_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) (result : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_ensures_0_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) (result : Int) : vc_gui_handle_studio_key_palette_ensures_0 panel palette w h input result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_palette_ensures_1 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) (result : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_ensures_1_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) (result : Int) : vc_gui_handle_studio_key_palette_ensures_1 panel palette w h input result := trivial
def vc_gui_handle_studio_key_palette_decreases_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Nat := 0
theorem vc_gui_handle_studio_key_palette_decreases_0_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_decreases_0 panel palette w h input = 0 := rfl
def vc_gui_handle_studio_key_palette_call0_studio_palette_open_flag_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_call0_studio_palette_open_flag_requires_0_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_call0_studio_palette_open_flag_requires_0 panel palette w h input := trivial
/-! VC call-site requires (opaque): callee 'gui_studio_palette_close_compose' at call 1 -/
def vc_gui_handle_studio_key_palette_call1_gui_studio_palette_close_compose_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_palette_close_compose' at call 1 -/
def vc_gui_handle_studio_key_palette_call1_gui_studio_palette_close_compose_requires_1 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_palette_close_compose' at call 1 -/
def vc_gui_handle_studio_key_palette_call1_gui_studio_palette_close_compose_requires_2 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
def vc_gui_handle_studio_key_palette_call2_studio_key_action_none_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_call2_studio_key_action_none_requires_0_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_call2_studio_key_action_none_requires_0 panel palette w h input := trivial
def vc_gui_handle_studio_key_palette_call3_gui_studio_palette_toggle_compose_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) (key_w : Float) : Prop := (key_w > (0 : Float))
def vc_gui_handle_studio_key_palette_call3_gui_studio_palette_toggle_compose_requires_1 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) (key_h : Float) : Prop := (key_h > (0 : Float))
/-! VC call-site requires (opaque): callee 'gui_studio_palette_toggle_compose' at call 3 -/
def vc_gui_handle_studio_key_palette_call3_gui_studio_palette_toggle_compose_requires_2 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_palette_toggle_compose' at call 3 -/
def vc_gui_handle_studio_key_palette_call3_gui_studio_palette_toggle_compose_requires_3 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_palette_toggle_compose' at call 3 -/
def vc_gui_handle_studio_key_palette_call3_gui_studio_palette_toggle_compose_requires_4 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_palette_toggle_compose' at call 3 -/
def vc_gui_handle_studio_key_palette_call3_gui_studio_palette_toggle_compose_requires_5 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
def vc_gui_handle_studio_key_palette_call4_studio_palette_open_flag_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_call4_studio_palette_open_flag_requires_0_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_call4_studio_palette_open_flag_requires_0 panel palette w h input := trivial
def vc_gui_handle_studio_key_palette_call5_studio_palette_result_count_stub_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_call5_studio_palette_result_count_stub_requires_0_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_call5_studio_palette_result_count_stub_requires_0 panel palette w h input := trivial
def vc_gui_handle_studio_key_palette_call6_gui_studio_palette_exec_compose_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) (exec_w : Float) : Prop := (exec_w > (0 : Float))
def vc_gui_handle_studio_key_palette_call6_gui_studio_palette_exec_compose_requires_1 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) (exec_h : Float) : Prop := (exec_h > (0 : Float))
/-! VC call-site requires (opaque): callee 'gui_studio_palette_exec_compose' at call 6 -/
def vc_gui_handle_studio_key_palette_call6_gui_studio_palette_exec_compose_requires_2 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_palette_exec_compose' at call 6 -/
def vc_gui_handle_studio_key_palette_call6_gui_studio_palette_exec_compose_requires_3 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_palette_exec_compose' at call 6 -/
def vc_gui_handle_studio_key_palette_call6_gui_studio_palette_exec_compose_requires_4 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
def vc_gui_handle_studio_key_palette_call7_studio_key_action_none_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_call7_studio_key_action_none_requires_0_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_call7_studio_key_action_none_requires_0 panel palette w h input := trivial
/-! VC call-site requires (opaque): callee 'gui_studio_region_from_focus_digit' at call 8 -/
def vc_gui_handle_studio_key_palette_call8_gui_studio_region_from_focus_digit_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_region_from_focus_digit' at call 8 -/
def vc_gui_handle_studio_key_palette_call8_gui_studio_region_from_focus_digit_requires_1 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
def vc_gui_handle_studio_key_palette_call9_studio_region_dock_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_call9_studio_region_dock_requires_0_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_call9_studio_region_dock_requires_0 panel palette w h input := trivial
def vc_gui_handle_studio_key_palette_call10_gui_panel_switch_to_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) (region : Int) : Prop := (region ≥ 1)
def vc_gui_handle_studio_key_palette_call10_gui_panel_switch_to_requires_1 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) (region : Int) : Prop := (region ≤ 6)
def vc_gui_handle_studio_key_palette_call10_gui_panel_switch_to_requires_2 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := ((0 : Float) ≥ (0 : Float))
/-! VC call-site requires (opaque): callee 'gui_panel_switch_to' at call 10 -/
def vc_gui_handle_studio_key_palette_call10_gui_panel_switch_to_requires_3 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
def vc_gui_handle_studio_key_palette_call11_studio_key_action_region_focus_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_call11_studio_key_action_region_focus_requires_0_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_call11_studio_key_action_region_focus_requires_0 panel palette w h input := trivial
def vc_gui_handle_studio_key_palette_call12_studio_key_action_none_requires_0 (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_palette_call12_studio_key_action_none_requires_0_proved (panel : Int) (palette : Int) (w : Float) (h : Float) (input : Int) : vc_gui_handle_studio_key_palette_call12_studio_key_action_none_requires_0 panel palette w h input := trivial

end gui_handle_studio_key_palette

namespace gui_handle_studio_key

/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_requires_0 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_requires_0_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_requires_0 panel input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_requires_1 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_requires_1_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_requires_1 panel input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_requires_2 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_requires_2_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_requires_2 panel input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_requires_3 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_requires_3_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_requires_3 panel input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_requires_4 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_requires_4_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_requires_4 panel input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_requires_5 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_requires_5_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_requires_5 panel input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_requires_6 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_requires_6_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_requires_6 panel input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_requires_7 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_requires_7_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_requires_7 panel input := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_requires_8 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_requires_8_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_requires_8 panel input := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_ensures_0 (panel : Int) (input : Int) (result : Int) : Prop := True
theorem vc_gui_handle_studio_key_ensures_0_proved (panel : Int) (input : Int) (result : Int) : vc_gui_handle_studio_key_ensures_0 panel input result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_handle_studio_key_ensures_1 (panel : Int) (input : Int) (result : Int) : Prop := True
theorem vc_gui_handle_studio_key_ensures_1_proved (panel : Int) (input : Int) (result : Int) : vc_gui_handle_studio_key_ensures_1 panel input result := trivial
def vc_gui_handle_studio_key_decreases_0 (panel : Int) (input : Int) : Nat := 0
theorem vc_gui_handle_studio_key_decreases_0_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_decreases_0 panel input = 0 := rfl
def vc_gui_handle_studio_key_call0_studio_palette_open_flag_requires_0 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_call0_studio_palette_open_flag_requires_0_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_call0_studio_palette_open_flag_requires_0 panel input := trivial
/-! VC call-site requires (opaque): callee 'gui_studio_palette_close' at call 1 -/
def vc_gui_handle_studio_key_call1_gui_studio_palette_close_requires_0 (panel : Int) (input : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_palette_close' at call 1 -/
def vc_gui_handle_studio_key_call1_gui_studio_palette_close_requires_1 (panel : Int) (input : Int) : Prop := True
def vc_gui_handle_studio_key_call2_studio_key_action_none_requires_0 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_call2_studio_key_action_none_requires_0_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_call2_studio_key_action_none_requires_0 panel input := trivial
/-! VC call-site requires (opaque): callee 'gui_studio_palette_toggle' at call 3 -/
def vc_gui_handle_studio_key_call3_gui_studio_palette_toggle_requires_0 (panel : Int) (input : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_palette_toggle' at call 3 -/
def vc_gui_handle_studio_key_call3_gui_studio_palette_toggle_requires_1 (panel : Int) (input : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_region_from_focus_digit' at call 4 -/
def vc_gui_handle_studio_key_call4_gui_studio_region_from_focus_digit_requires_0 (panel : Int) (input : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'gui_studio_region_from_focus_digit' at call 4 -/
def vc_gui_handle_studio_key_call4_gui_studio_region_from_focus_digit_requires_1 (panel : Int) (input : Int) : Prop := True
def vc_gui_handle_studio_key_call5_studio_region_dock_requires_0 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_call5_studio_region_dock_requires_0_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_call5_studio_region_dock_requires_0 panel input := trivial
def vc_gui_handle_studio_key_call6_gui_panel_switch_to_requires_0 (panel : Int) (input : Int) (region : Int) : Prop := (region ≥ 1)
def vc_gui_handle_studio_key_call6_gui_panel_switch_to_requires_1 (panel : Int) (input : Int) (region : Int) : Prop := (region ≤ 6)
def vc_gui_handle_studio_key_call6_gui_panel_switch_to_requires_2 (panel : Int) (input : Int) : Prop := ((0 : Float) ≥ (0 : Float))
/-! VC call-site requires (opaque): callee 'gui_panel_switch_to' at call 6 -/
def vc_gui_handle_studio_key_call6_gui_panel_switch_to_requires_3 (panel : Int) (input : Int) : Prop := True
def vc_gui_handle_studio_key_call7_studio_key_action_region_focus_requires_0 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_call7_studio_key_action_region_focus_requires_0_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_call7_studio_key_action_region_focus_requires_0 panel input := trivial
def vc_gui_handle_studio_key_call8_studio_key_action_none_requires_0 (panel : Int) (input : Int) : Prop := True
theorem vc_gui_handle_studio_key_call8_studio_key_action_none_requires_0_proved (panel : Int) (input : Int) : vc_gui_handle_studio_key_call8_studio_key_action_none_requires_0 panel input := trivial

end gui_handle_studio_key

namespace gui_paint_studio_shell_chrome

/-! VC requires (opaque): source expr not yet translated -/
def vc_gui_paint_studio_shell_chrome_requires_0 (frame : Int) (layout : Int) : Prop := True
theorem vc_gui_paint_studio_shell_chrome_requires_0_proved (frame : Int) (layout : Int) : vc_gui_paint_studio_shell_chrome_requires_0 frame layout := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_paint_studio_shell_chrome_ensures_0 (frame : Int) (layout : Int) (result : Unit) : Prop := True
theorem vc_gui_paint_studio_shell_chrome_ensures_0_proved (frame : Int) (layout : Int) (result : Unit) : vc_gui_paint_studio_shell_chrome_ensures_0 frame layout result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_paint_studio_shell_chrome_ensures_1 (frame : Int) (layout : Int) (result : Unit) : Prop := True
theorem vc_gui_paint_studio_shell_chrome_ensures_1_proved (frame : Int) (layout : Int) (result : Unit) : vc_gui_paint_studio_shell_chrome_ensures_1 frame layout result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_paint_studio_shell_chrome_ensures_2 (frame : Int) (layout : Int) (result : Unit) : Prop := True
theorem vc_gui_paint_studio_shell_chrome_ensures_2_proved (frame : Int) (layout : Int) (result : Unit) : vc_gui_paint_studio_shell_chrome_ensures_2 frame layout result := trivial
def vc_gui_paint_studio_shell_chrome_decreases_0 (frame : Int) (layout : Int) : Nat := 0
theorem vc_gui_paint_studio_shell_chrome_decreases_0_proved (frame : Int) (layout : Int) : vc_gui_paint_studio_shell_chrome_decreases_0 frame layout = 0 := rfl
/-! VC call-site requires (opaque): callee 'paint_studio_shell_chrome' at call 0 -/
def vc_gui_paint_studio_shell_chrome_call0_paint_studio_shell_chrome_requires_0 (frame : Int) (layout : Int) : Prop := True

end gui_paint_studio_shell_chrome

namespace gui_studio_shell_frame

def vc_gui_studio_shell_frame_requires_0 (w : Float) (h : Float) : Prop := (w > (0 : Float))
def vc_gui_studio_shell_frame_requires_1 (w : Float) (h : Float) : Prop := (h > (0 : Float))
/-! VC ensures (opaque): source expr not yet translated -/
def vc_gui_studio_shell_frame_ensures_0 (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_gui_studio_shell_frame_ensures_0_proved (w : Float) (h : Float) (result : Int) : vc_gui_studio_shell_frame_ensures_0 w h result := trivial
def vc_gui_studio_shell_frame_decreases_0 (w : Float) (h : Float) : Nat := 0
theorem vc_gui_studio_shell_frame_decreases_0_proved (w : Float) (h : Float) : vc_gui_studio_shell_frame_decreases_0 w h = 0 := rfl
def vc_gui_studio_shell_frame_call0_layout_studio_shell_adaptive_requires_0 (w : Float) (h : Float) : Prop := (w > (0 : Float))
def vc_gui_studio_shell_frame_call0_layout_studio_shell_adaptive_requires_1 (w : Float) (h : Float) : Prop := (h > (0 : Float))
def vc_gui_studio_shell_frame_call1_paint_frame_new_requires_0 (w : Float) (h : Float) : Prop := True
theorem vc_gui_studio_shell_frame_call1_paint_frame_new_requires_0_proved (w : Float) (h : Float) : vc_gui_studio_shell_frame_call1_paint_frame_new_requires_0 w h := trivial
/-! VC call-site requires (opaque): callee 'gui_paint_studio_shell_chrome' at call 2 -/
def vc_gui_studio_shell_frame_call2_gui_paint_studio_shell_chrome_requires_0 (w : Float) (h : Float) (frame : Int) : Prop := True

end gui_studio_shell_frame

namespace li_std_ui_version

def vc_li_std_ui_version_requires_0 : Prop := True
theorem vc_li_std_ui_version_requires_0_proved : vc_li_std_ui_version_requires_0 := trivial
def vc_li_std_ui_version_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_li_std_ui_version_ensures_0_proved (result : Int) : vc_li_std_ui_version_ensures_0 result := trivial
def vc_li_std_ui_version_decreases_0 : Nat := 0
theorem vc_li_std_ui_version_decreases_0_proved : vc_li_std_ui_version_decreases_0 = 0 := rfl

end li_std_ui_version

namespace li_std_ui_studio_composables_version

def vc_li_std_ui_studio_composables_version_requires_0 : Prop := True
theorem vc_li_std_ui_studio_composables_version_requires_0_proved : vc_li_std_ui_studio_composables_version_requires_0 := trivial
def vc_li_std_ui_studio_composables_version_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_li_std_ui_studio_composables_version_ensures_0_proved (result : Int) : vc_li_std_ui_studio_composables_version_ensures_0 result := trivial
def vc_li_std_ui_studio_composables_version_decreases_0 : Nat := 0
theorem vc_li_std_ui_studio_composables_version_decreases_0_proved : vc_li_std_ui_studio_composables_version_decreases_0 = 0 := rfl

end li_std_ui_studio_composables_version

namespace color_rgb

def vc_color_rgb_requires_0 (r : Float) (g : Float) (b : Float) (a : Float) : Prop := (r ≥ (0 : Float))
def vc_color_rgb_requires_1 (r : Float) (g : Float) (b : Float) (a : Float) : Prop := (g ≥ (0 : Float))
def vc_color_rgb_requires_2 (r : Float) (g : Float) (b : Float) (a : Float) : Prop := (b ≥ (0 : Float))
def vc_color_rgb_requires_3 (r : Float) (g : Float) (b : Float) (a : Float) : Prop := (a ≥ (0 : Float))
def vc_color_rgb_requires_4 (r : Float) (g : Float) (b : Float) (a : Float) : Prop := (a ≤ (1 : Float))
/-! VC ensures (opaque): source expr not yet translated -/
def vc_color_rgb_ensures_0 (r : Float) (g : Float) (b : Float) (a : Float) (result : Int) : Prop := True
theorem vc_color_rgb_ensures_0_proved (r : Float) (g : Float) (b : Float) (a : Float) (result : Int) : vc_color_rgb_ensures_0 r g b a result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_color_rgb_ensures_1 (r : Float) (g : Float) (b : Float) (a : Float) (result : Int) : Prop := True
theorem vc_color_rgb_ensures_1_proved (r : Float) (g : Float) (b : Float) (a : Float) (result : Int) : vc_color_rgb_ensures_1 r g b a result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_color_rgb_ensures_2 (r : Float) (g : Float) (b : Float) (a : Float) (result : Int) : Prop := True
theorem vc_color_rgb_ensures_2_proved (r : Float) (g : Float) (b : Float) (a : Float) (result : Int) : vc_color_rgb_ensures_2 r g b a result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_color_rgb_ensures_3 (r : Float) (g : Float) (b : Float) (a : Float) (result : Int) : Prop := True
theorem vc_color_rgb_ensures_3_proved (r : Float) (g : Float) (b : Float) (a : Float) (result : Int) : vc_color_rgb_ensures_3 r g b a result := trivial
def vc_color_rgb_decreases_0 (r : Float) (g : Float) (b : Float) (a : Float) : Nat := 0
theorem vc_color_rgb_decreases_0_proved (r : Float) (g : Float) (b : Float) (a : Float) : vc_color_rgb_decreases_0 r g b a = 0 := rfl

end color_rgb

namespace rect_contains

/-! VC requires (opaque): source expr not yet translated -/
def vc_rect_contains_requires_0 (r : Int) (px : Float) (py : Float) : Prop := True
theorem vc_rect_contains_requires_0_proved (r : Int) (px : Float) (py : Float) : vc_rect_contains_requires_0 r px py := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_rect_contains_requires_1 (r : Int) (px : Float) (py : Float) : Prop := True
theorem vc_rect_contains_requires_1_proved (r : Int) (px : Float) (py : Float) : vc_rect_contains_requires_1 r px py := trivial
def vc_rect_contains_ensures_0 (r : Int) (px : Float) (py : Float) (result : Int) : Prop := (result ≥ 0)
def vc_rect_contains_ensures_1 (r : Int) (px : Float) (py : Float) (result : Int) : Prop := (result ≤ 1)
def vc_rect_contains_decreases_0 (r : Int) (px : Float) (py : Float) : Nat := 0
theorem vc_rect_contains_decreases_0_proved (r : Int) (px : Float) (py : Float) : vc_rect_contains_decreases_0 r px py = 0 := rfl

end rect_contains

namespace ui_frame_begin

def vc_ui_frame_begin_requires_0 (w : Float) (h : Float) (dt : Float) : Prop := (w > (0 : Float))
def vc_ui_frame_begin_requires_1 (w : Float) (h : Float) (dt : Float) : Prop := (h > (0 : Float))
def vc_ui_frame_begin_requires_2 (w : Float) (h : Float) (dt : Float) : Prop := (dt > (0 : Float))
/-! VC ensures (opaque): source expr not yet translated -/
def vc_ui_frame_begin_ensures_0 (w : Float) (h : Float) (dt : Float) (result : Int) : Prop := True
theorem vc_ui_frame_begin_ensures_0_proved (w : Float) (h : Float) (dt : Float) (result : Int) : vc_ui_frame_begin_ensures_0 w h dt result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_ui_frame_begin_ensures_1 (w : Float) (h : Float) (dt : Float) (result : Int) : Prop := True
theorem vc_ui_frame_begin_ensures_1_proved (w : Float) (h : Float) (dt : Float) (result : Int) : vc_ui_frame_begin_ensures_1 w h dt result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_ui_frame_begin_ensures_2 (w : Float) (h : Float) (dt : Float) (result : Int) : Prop := True
theorem vc_ui_frame_begin_ensures_2_proved (w : Float) (h : Float) (dt : Float) (result : Int) : vc_ui_frame_begin_ensures_2 w h dt result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_ui_frame_begin_ensures_3 (w : Float) (h : Float) (dt : Float) (result : Int) : Prop := True
theorem vc_ui_frame_begin_ensures_3_proved (w : Float) (h : Float) (dt : Float) (result : Int) : vc_ui_frame_begin_ensures_3 w h dt result := trivial
def vc_ui_frame_begin_decreases_0 (w : Float) (h : Float) (dt : Float) : Nat := 0
theorem vc_ui_frame_begin_decreases_0_proved (w : Float) (h : Float) (dt : Float) : vc_ui_frame_begin_decreases_0 w h dt = 0 := rfl

end ui_frame_begin

namespace ui_frame_end

def vc_ui_frame_end_requires_0 (frame : Int) : Prop := True
theorem vc_ui_frame_end_requires_0_proved (frame : Int) : vc_ui_frame_end_requires_0 frame := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_ui_frame_end_ensures_0 (frame : Int) (result : Unit) : Prop := True
theorem vc_ui_frame_end_ensures_0_proved (frame : Int) (result : Unit) : vc_ui_frame_end_ensures_0 frame result := trivial
def vc_ui_frame_end_decreases_0 (frame : Int) : Nat := 0
theorem vc_ui_frame_end_decreases_0_proved (frame : Int) : vc_ui_frame_end_decreases_0 frame = 0 := rfl

end ui_frame_end

namespace input_default

def vc_input_default_requires_0 : Prop := True
theorem vc_input_default_requires_0_proved : vc_input_default_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_input_default_ensures_0 (result : Int) : Prop := True
theorem vc_input_default_ensures_0_proved (result : Int) : vc_input_default_ensures_0 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_input_default_ensures_1 (result : Int) : Prop := True
theorem vc_input_default_ensures_1_proved (result : Int) : vc_input_default_ensures_1 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_input_default_ensures_2 (result : Int) : Prop := True
theorem vc_input_default_ensures_2_proved (result : Int) : vc_input_default_ensures_2 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_input_default_ensures_3 (result : Int) : Prop := True
theorem vc_input_default_ensures_3_proved (result : Int) : vc_input_default_ensures_3 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_input_default_ensures_4 (result : Int) : Prop := True
theorem vc_input_default_ensures_4_proved (result : Int) : vc_input_default_ensures_4 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_input_default_ensures_5 (result : Int) : Prop := True
theorem vc_input_default_ensures_5_proved (result : Int) : vc_input_default_ensures_5 result := trivial
def vc_input_default_decreases_0 : Nat := 0
theorem vc_input_default_decreases_0_proved : vc_input_default_decreases_0 = 0 := rfl

end input_default

namespace studio_color_bg_primary

def vc_studio_color_bg_primary_requires_0 : Prop := True
theorem vc_studio_color_bg_primary_requires_0_proved : vc_studio_color_bg_primary_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_bg_primary_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_bg_primary_ensures_0_proved (result : Int) : vc_studio_color_bg_primary_ensures_0 result := trivial
def vc_studio_color_bg_primary_decreases_0 : Nat := 0
theorem vc_studio_color_bg_primary_decreases_0_proved : vc_studio_color_bg_primary_decreases_0 = 0 := rfl
def vc_studio_color_bg_primary_call0_color_rgb_requires_0 : Prop := ((0.051 : Float) ≥ (0 : Float))
def vc_studio_color_bg_primary_call0_color_rgb_requires_1 : Prop := ((0.067 : Float) ≥ (0 : Float))
def vc_studio_color_bg_primary_call0_color_rgb_requires_2 : Prop := ((0.09 : Float) ≥ (0 : Float))
def vc_studio_color_bg_primary_call0_color_rgb_requires_3 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_bg_primary_call0_color_rgb_requires_4 : Prop := ((1 : Float) ≤ (1 : Float))

end studio_color_bg_primary

namespace studio_color_bg_elevated

def vc_studio_color_bg_elevated_requires_0 : Prop := True
theorem vc_studio_color_bg_elevated_requires_0_proved : vc_studio_color_bg_elevated_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_bg_elevated_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_bg_elevated_ensures_0_proved (result : Int) : vc_studio_color_bg_elevated_ensures_0 result := trivial
def vc_studio_color_bg_elevated_decreases_0 : Nat := 0
theorem vc_studio_color_bg_elevated_decreases_0_proved : vc_studio_color_bg_elevated_decreases_0 = 0 := rfl
def vc_studio_color_bg_elevated_call0_color_rgb_requires_0 : Prop := ((0.086 : Float) ≥ (0 : Float))
def vc_studio_color_bg_elevated_call0_color_rgb_requires_1 : Prop := ((0.106 : Float) ≥ (0 : Float))
def vc_studio_color_bg_elevated_call0_color_rgb_requires_2 : Prop := ((0.133 : Float) ≥ (0 : Float))
def vc_studio_color_bg_elevated_call0_color_rgb_requires_3 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_bg_elevated_call0_color_rgb_requires_4 : Prop := ((1 : Float) ≤ (1 : Float))

end studio_color_bg_elevated

namespace studio_color_accent_cyan

def vc_studio_color_accent_cyan_requires_0 : Prop := True
theorem vc_studio_color_accent_cyan_requires_0_proved : vc_studio_color_accent_cyan_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_accent_cyan_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_accent_cyan_ensures_0_proved (result : Int) : vc_studio_color_accent_cyan_ensures_0 result := trivial
def vc_studio_color_accent_cyan_decreases_0 : Nat := 0
theorem vc_studio_color_accent_cyan_decreases_0_proved : vc_studio_color_accent_cyan_decreases_0 = 0 := rfl
def vc_studio_color_accent_cyan_call0_color_rgb_requires_0 : Prop := ((0.239 : Float) ≥ (0 : Float))
def vc_studio_color_accent_cyan_call0_color_rgb_requires_1 : Prop := ((0.839 : Float) ≥ (0 : Float))
def vc_studio_color_accent_cyan_call0_color_rgb_requires_2 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_accent_cyan_call0_color_rgb_requires_3 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_accent_cyan_call0_color_rgb_requires_4 : Prop := ((1 : Float) ≤ (1 : Float))

end studio_color_accent_cyan

namespace studio_color_accent_violet

def vc_studio_color_accent_violet_requires_0 : Prop := True
theorem vc_studio_color_accent_violet_requires_0_proved : vc_studio_color_accent_violet_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_accent_violet_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_accent_violet_ensures_0_proved (result : Int) : vc_studio_color_accent_violet_ensures_0 result := trivial
def vc_studio_color_accent_violet_decreases_0 : Nat := 0
theorem vc_studio_color_accent_violet_decreases_0_proved : vc_studio_color_accent_violet_decreases_0 = 0 := rfl
def vc_studio_color_accent_violet_call0_color_rgb_requires_0 : Prop := ((0.486 : Float) ≥ (0 : Float))
def vc_studio_color_accent_violet_call0_color_rgb_requires_1 : Prop := ((0.361 : Float) ≥ (0 : Float))
def vc_studio_color_accent_violet_call0_color_rgb_requires_2 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_accent_violet_call0_color_rgb_requires_3 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_accent_violet_call0_color_rgb_requires_4 : Prop := ((1 : Float) ≤ (1 : Float))

end studio_color_accent_violet

namespace studio_color_accent_mint

def vc_studio_color_accent_mint_requires_0 : Prop := True
theorem vc_studio_color_accent_mint_requires_0_proved : vc_studio_color_accent_mint_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_accent_mint_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_accent_mint_ensures_0_proved (result : Int) : vc_studio_color_accent_mint_ensures_0 result := trivial
def vc_studio_color_accent_mint_decreases_0 : Nat := 0
theorem vc_studio_color_accent_mint_decreases_0_proved : vc_studio_color_accent_mint_decreases_0 = 0 := rfl
def vc_studio_color_accent_mint_call0_color_rgb_requires_0 : Prop := ((0.18 : Float) ≥ (0 : Float))
def vc_studio_color_accent_mint_call0_color_rgb_requires_1 : Prop := ((0.902 : Float) ≥ (0 : Float))
def vc_studio_color_accent_mint_call0_color_rgb_requires_2 : Prop := ((0.659 : Float) ≥ (0 : Float))
def vc_studio_color_accent_mint_call0_color_rgb_requires_3 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_accent_mint_call0_color_rgb_requires_4 : Prop := ((1 : Float) ≤ (1 : Float))

end studio_color_accent_mint

namespace studio_color_border

def vc_studio_color_border_requires_0 : Prop := True
theorem vc_studio_color_border_requires_0_proved : vc_studio_color_border_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_border_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_border_ensures_0_proved (result : Int) : vc_studio_color_border_ensures_0 result := trivial
def vc_studio_color_border_decreases_0 : Nat := 0
theorem vc_studio_color_border_decreases_0_proved : vc_studio_color_border_decreases_0 = 0 := rfl
def vc_studio_color_border_call0_color_rgb_requires_0 : Prop := ((0.188 : Float) ≥ (0 : Float))
def vc_studio_color_border_call0_color_rgb_requires_1 : Prop := ((0.212 : Float) ≥ (0 : Float))
def vc_studio_color_border_call0_color_rgb_requires_2 : Prop := ((0.239 : Float) ≥ (0 : Float))
def vc_studio_color_border_call0_color_rgb_requires_3 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_border_call0_color_rgb_requires_4 : Prop := ((1 : Float) ≤ (1 : Float))

end studio_color_border

namespace studio_color_focus_ring

def vc_studio_color_focus_ring_requires_0 : Prop := True
theorem vc_studio_color_focus_ring_requires_0_proved : vc_studio_color_focus_ring_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_focus_ring_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_focus_ring_ensures_0_proved (result : Int) : vc_studio_color_focus_ring_ensures_0 result := trivial
def vc_studio_color_focus_ring_decreases_0 : Nat := 0
theorem vc_studio_color_focus_ring_decreases_0_proved : vc_studio_color_focus_ring_decreases_0 = 0 := rfl
def vc_studio_color_focus_ring_call0_color_rgb_requires_0 : Prop := ((0.239 : Float) ≥ (0 : Float))
def vc_studio_color_focus_ring_call0_color_rgb_requires_1 : Prop := ((0.839 : Float) ≥ (0 : Float))
def vc_studio_color_focus_ring_call0_color_rgb_requires_2 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_focus_ring_call0_color_rgb_requires_3 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_focus_ring_call0_color_rgb_requires_4 : Prop := ((1 : Float) ≤ (1 : Float))

end studio_color_focus_ring

namespace studio_focus_ring_stroke_px

def vc_studio_focus_ring_stroke_px_requires_0 : Prop := True
theorem vc_studio_focus_ring_stroke_px_requires_0_proved : vc_studio_focus_ring_stroke_px_requires_0 := trivial
def vc_studio_focus_ring_stroke_px_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_focus_ring_stroke_px_ensures_0_proved (result : Float) : vc_studio_focus_ring_stroke_px_ensures_0 result := trivial
def vc_studio_focus_ring_stroke_px_decreases_0 : Nat := 0
theorem vc_studio_focus_ring_stroke_px_decreases_0_proved : vc_studio_focus_ring_stroke_px_decreases_0 = 0 := rfl

end studio_focus_ring_stroke_px

namespace studio_contrast_ratio_ok

def vc_studio_contrast_ratio_ok_requires_0 : Prop := True
theorem vc_studio_contrast_ratio_ok_requires_0_proved : vc_studio_contrast_ratio_ok_requires_0 := trivial
def vc_studio_contrast_ratio_ok_ensures_0 (result : Float) : Prop := (result ≥ (1 : Float))
def vc_studio_contrast_ratio_ok_decreases_0 : Nat := 0
theorem vc_studio_contrast_ratio_ok_decreases_0_proved : vc_studio_contrast_ratio_ok_decreases_0 = 0 := rfl

end studio_contrast_ratio_ok

namespace studio_color_skeleton_muted

def vc_studio_color_skeleton_muted_requires_0 : Prop := True
theorem vc_studio_color_skeleton_muted_requires_0_proved : vc_studio_color_skeleton_muted_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_skeleton_muted_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_skeleton_muted_ensures_0_proved (result : Int) : vc_studio_color_skeleton_muted_ensures_0 result := trivial
def vc_studio_color_skeleton_muted_decreases_0 : Nat := 0
theorem vc_studio_color_skeleton_muted_decreases_0_proved : vc_studio_color_skeleton_muted_decreases_0 = 0 := rfl
def vc_studio_color_skeleton_muted_call0_color_rgb_requires_0 : Prop := ((0.118 : Float) ≥ (0 : Float))
def vc_studio_color_skeleton_muted_call0_color_rgb_requires_1 : Prop := ((0.145 : Float) ≥ (0 : Float))
def vc_studio_color_skeleton_muted_call0_color_rgb_requires_2 : Prop := ((0.18 : Float) ≥ (0 : Float))
def vc_studio_color_skeleton_muted_call0_color_rgb_requires_3 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_skeleton_muted_call0_color_rgb_requires_4 : Prop := ((1 : Float) ≤ (1 : Float))

end studio_color_skeleton_muted

namespace studio_color_skeleton_highlight

def vc_studio_color_skeleton_highlight_requires_0 : Prop := True
theorem vc_studio_color_skeleton_highlight_requires_0_proved : vc_studio_color_skeleton_highlight_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_skeleton_highlight_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_skeleton_highlight_ensures_0_proved (result : Int) : vc_studio_color_skeleton_highlight_ensures_0 result := trivial
def vc_studio_color_skeleton_highlight_decreases_0 : Nat := 0
theorem vc_studio_color_skeleton_highlight_decreases_0_proved : vc_studio_color_skeleton_highlight_decreases_0 = 0 := rfl
def vc_studio_color_skeleton_highlight_call0_color_rgb_requires_0 : Prop := ((0.145 : Float) ≥ (0 : Float))
def vc_studio_color_skeleton_highlight_call0_color_rgb_requires_1 : Prop := ((0.173 : Float) ≥ (0 : Float))
def vc_studio_color_skeleton_highlight_call0_color_rgb_requires_2 : Prop := ((0.212 : Float) ≥ (0 : Float))
def vc_studio_color_skeleton_highlight_call0_color_rgb_requires_3 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_skeleton_highlight_call0_color_rgb_requires_4 : Prop := ((1 : Float) ≤ (1 : Float))

end studio_color_skeleton_highlight

namespace studio_paint_focus_ring

/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_paint_focus_ring_requires_0 (frame : Int) (region_rect : Int) : Prop := True
theorem vc_studio_paint_focus_ring_requires_0_proved (frame : Int) (region_rect : Int) : vc_studio_paint_focus_ring_requires_0 frame region_rect := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_paint_focus_ring_requires_1 (frame : Int) (region_rect : Int) : Prop := True
theorem vc_studio_paint_focus_ring_requires_1_proved (frame : Int) (region_rect : Int) : vc_studio_paint_focus_ring_requires_1 frame region_rect := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_paint_focus_ring_requires_2 (frame : Int) (region_rect : Int) : Prop := True
theorem vc_studio_paint_focus_ring_requires_2_proved (frame : Int) (region_rect : Int) : vc_studio_paint_focus_ring_requires_2 frame region_rect := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_paint_focus_ring_ensures_0 (frame : Int) (region_rect : Int) (result : Unit) : Prop := True
theorem vc_studio_paint_focus_ring_ensures_0_proved (frame : Int) (region_rect : Int) (result : Unit) : vc_studio_paint_focus_ring_ensures_0 frame region_rect result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_paint_focus_ring_ensures_1 (frame : Int) (region_rect : Int) (result : Unit) : Prop := True
theorem vc_studio_paint_focus_ring_ensures_1_proved (frame : Int) (region_rect : Int) (result : Unit) : vc_studio_paint_focus_ring_ensures_1 frame region_rect result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_paint_focus_ring_ensures_2 (frame : Int) (region_rect : Int) (result : Unit) : Prop := True
theorem vc_studio_paint_focus_ring_ensures_2_proved (frame : Int) (region_rect : Int) (result : Unit) : vc_studio_paint_focus_ring_ensures_2 frame region_rect result := trivial
def vc_studio_paint_focus_ring_decreases_0 (frame : Int) (region_rect : Int) : Nat := 0
theorem vc_studio_paint_focus_ring_decreases_0_proved (frame : Int) (region_rect : Int) : vc_studio_paint_focus_ring_decreases_0 frame region_rect = 0 := rfl
def vc_studio_paint_focus_ring_call0_paint_op_stroke_rect_requires_0 (frame : Int) (region_rect : Int) : Prop := True
theorem vc_studio_paint_focus_ring_call0_paint_op_stroke_rect_requires_0_proved (frame : Int) (region_rect : Int) : vc_studio_paint_focus_ring_call0_paint_op_stroke_rect_requires_0 frame region_rect := trivial
def vc_studio_paint_focus_ring_call1_studio_color_focus_ring_requires_0 (frame : Int) (region_rect : Int) : Prop := True
theorem vc_studio_paint_focus_ring_call1_studio_color_focus_ring_requires_0_proved (frame : Int) (region_rect : Int) : vc_studio_paint_focus_ring_call1_studio_color_focus_ring_requires_0 frame region_rect := trivial

end studio_paint_focus_ring

namespace studio_color_accent_amber

def vc_studio_color_accent_amber_requires_0 : Prop := True
theorem vc_studio_color_accent_amber_requires_0_proved : vc_studio_color_accent_amber_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_accent_amber_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_accent_amber_ensures_0_proved (result : Int) : vc_studio_color_accent_amber_ensures_0 result := trivial
def vc_studio_color_accent_amber_decreases_0 : Nat := 0
theorem vc_studio_color_accent_amber_decreases_0_proved : vc_studio_color_accent_amber_decreases_0 = 0 := rfl
def vc_studio_color_accent_amber_call0_color_rgb_requires_0 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_accent_amber_call0_color_rgb_requires_1 : Prop := ((0.702 : Float) ≥ (0 : Float))
def vc_studio_color_accent_amber_call0_color_rgb_requires_2 : Prop := ((0.278 : Float) ≥ (0 : Float))
def vc_studio_color_accent_amber_call0_color_rgb_requires_3 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_accent_amber_call0_color_rgb_requires_4 : Prop := ((1 : Float) ≤ (1 : Float))

end studio_color_accent_amber

namespace studio_color_agent_running

def vc_studio_color_agent_running_requires_0 : Prop := True
theorem vc_studio_color_agent_running_requires_0_proved : vc_studio_color_agent_running_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_agent_running_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_agent_running_ensures_0_proved (result : Int) : vc_studio_color_agent_running_ensures_0 result := trivial
def vc_studio_color_agent_running_decreases_0 : Nat := 0
theorem vc_studio_color_agent_running_decreases_0_proved : vc_studio_color_agent_running_decreases_0 = 0 := rfl
def vc_studio_color_agent_running_call0_color_rgb_requires_0 : Prop := ((0.137 : Float) ≥ (0 : Float))
def vc_studio_color_agent_running_call0_color_rgb_requires_1 : Prop := ((0.525 : Float) ≥ (0 : Float))
def vc_studio_color_agent_running_call0_color_rgb_requires_2 : Prop := ((0.212 : Float) ≥ (0 : Float))
def vc_studio_color_agent_running_call0_color_rgb_requires_3 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_agent_running_call0_color_rgb_requires_4 : Prop := ((1 : Float) ≤ (1 : Float))

end studio_color_agent_running

namespace studio_color_agent_error

def vc_studio_color_agent_error_requires_0 : Prop := True
theorem vc_studio_color_agent_error_requires_0_proved : vc_studio_color_agent_error_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_agent_error_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_agent_error_ensures_0_proved (result : Int) : vc_studio_color_agent_error_ensures_0 result := trivial
def vc_studio_color_agent_error_decreases_0 : Nat := 0
theorem vc_studio_color_agent_error_decreases_0_proved : vc_studio_color_agent_error_decreases_0 = 0 := rfl
def vc_studio_color_agent_error_call0_color_rgb_requires_0 : Prop := ((0.855 : Float) ≥ (0 : Float))
def vc_studio_color_agent_error_call0_color_rgb_requires_1 : Prop := ((0.212 : Float) ≥ (0 : Float))
def vc_studio_color_agent_error_call0_color_rgb_requires_2 : Prop := ((0.2 : Float) ≥ (0 : Float))
def vc_studio_color_agent_error_call0_color_rgb_requires_3 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_agent_error_call0_color_rgb_requires_4 : Prop := ((1 : Float) ≤ (1 : Float))

end studio_color_agent_error

namespace studio_color_agent_idle

def vc_studio_color_agent_idle_requires_0 : Prop := True
theorem vc_studio_color_agent_idle_requires_0_proved : vc_studio_color_agent_idle_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_agent_idle_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_agent_idle_ensures_0_proved (result : Int) : vc_studio_color_agent_idle_ensures_0 result := trivial
def vc_studio_color_agent_idle_decreases_0 : Nat := 0
theorem vc_studio_color_agent_idle_decreases_0_proved : vc_studio_color_agent_idle_decreases_0 = 0 := rfl
def vc_studio_color_agent_idle_call0_color_rgb_requires_0 : Prop := ((0.545 : Float) ≥ (0 : Float))
def vc_studio_color_agent_idle_call0_color_rgb_requires_1 : Prop := ((0.58 : Float) ≥ (0 : Float))
def vc_studio_color_agent_idle_call0_color_rgb_requires_2 : Prop := ((0.62 : Float) ≥ (0 : Float))
def vc_studio_color_agent_idle_call0_color_rgb_requires_3 : Prop := ((1 : Float) ≥ (0 : Float))
def vc_studio_color_agent_idle_call0_color_rgb_requires_4 : Prop := ((1 : Float) ≤ (1 : Float))

end studio_color_agent_idle

namespace studio_color_agent_blocked

def vc_studio_color_agent_blocked_requires_0 : Prop := True
theorem vc_studio_color_agent_blocked_requires_0_proved : vc_studio_color_agent_blocked_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_agent_blocked_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_agent_blocked_ensures_0_proved (result : Int) : vc_studio_color_agent_blocked_ensures_0 result := trivial
def vc_studio_color_agent_blocked_decreases_0 : Nat := 0
theorem vc_studio_color_agent_blocked_decreases_0_proved : vc_studio_color_agent_blocked_decreases_0 = 0 := rfl
def vc_studio_color_agent_blocked_call0_studio_color_accent_amber_requires_0 : Prop := True
theorem vc_studio_color_agent_blocked_call0_studio_color_accent_amber_requires_0_proved : vc_studio_color_agent_blocked_call0_studio_color_accent_amber_requires_0 := trivial

end studio_color_agent_blocked

namespace studio_color_agent_done

def vc_studio_color_agent_done_requires_0 : Prop := True
theorem vc_studio_color_agent_done_requires_0_proved : vc_studio_color_agent_done_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_color_agent_done_ensures_0 (result : Int) : Prop := True
theorem vc_studio_color_agent_done_ensures_0_proved (result : Int) : vc_studio_color_agent_done_ensures_0 result := trivial
def vc_studio_color_agent_done_decreases_0 : Nat := 0
theorem vc_studio_color_agent_done_decreases_0_proved : vc_studio_color_agent_done_decreases_0 = 0 := rfl
def vc_studio_color_agent_done_call0_studio_color_accent_mint_requires_0 : Prop := True
theorem vc_studio_color_agent_done_call0_studio_color_accent_mint_requires_0_proved : vc_studio_color_agent_done_call0_studio_color_accent_mint_requires_0 := trivial

end studio_color_agent_done

namespace studio_agent_task_idle

def vc_studio_agent_task_idle_requires_0 : Prop := True
theorem vc_studio_agent_task_idle_requires_0_proved : vc_studio_agent_task_idle_requires_0 := trivial
def vc_studio_agent_task_idle_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_task_idle_ensures_0_proved (result : Int) : vc_studio_agent_task_idle_ensures_0 result := trivial
def vc_studio_agent_task_idle_decreases_0 : Nat := 0
theorem vc_studio_agent_task_idle_decreases_0_proved : vc_studio_agent_task_idle_decreases_0 = 0 := rfl

end studio_agent_task_idle

namespace studio_agent_task_running

def vc_studio_agent_task_running_requires_0 : Prop := True
theorem vc_studio_agent_task_running_requires_0_proved : vc_studio_agent_task_running_requires_0 := trivial
def vc_studio_agent_task_running_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_task_running_ensures_0_proved (result : Int) : vc_studio_agent_task_running_ensures_0 result := trivial
def vc_studio_agent_task_running_decreases_0 : Nat := 0
theorem vc_studio_agent_task_running_decreases_0_proved : vc_studio_agent_task_running_decreases_0 = 0 := rfl

end studio_agent_task_running

namespace studio_agent_task_blocked

def vc_studio_agent_task_blocked_requires_0 : Prop := True
theorem vc_studio_agent_task_blocked_requires_0_proved : vc_studio_agent_task_blocked_requires_0 := trivial
def vc_studio_agent_task_blocked_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_task_blocked_ensures_0_proved (result : Int) : vc_studio_agent_task_blocked_ensures_0 result := trivial
def vc_studio_agent_task_blocked_decreases_0 : Nat := 0
theorem vc_studio_agent_task_blocked_decreases_0_proved : vc_studio_agent_task_blocked_decreases_0 = 0 := rfl

end studio_agent_task_blocked

namespace studio_agent_task_failed

def vc_studio_agent_task_failed_requires_0 : Prop := True
theorem vc_studio_agent_task_failed_requires_0_proved : vc_studio_agent_task_failed_requires_0 := trivial
def vc_studio_agent_task_failed_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_task_failed_ensures_0_proved (result : Int) : vc_studio_agent_task_failed_ensures_0 result := trivial
def vc_studio_agent_task_failed_decreases_0 : Nat := 0
theorem vc_studio_agent_task_failed_decreases_0_proved : vc_studio_agent_task_failed_decreases_0 = 0 := rfl

end studio_agent_task_failed

namespace studio_agent_task_done

def vc_studio_agent_task_done_requires_0 : Prop := True
theorem vc_studio_agent_task_done_requires_0_proved : vc_studio_agent_task_done_requires_0 := trivial
def vc_studio_agent_task_done_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_task_done_ensures_0_proved (result : Int) : vc_studio_agent_task_done_ensures_0 result := trivial
def vc_studio_agent_task_done_decreases_0 : Nat := 0
theorem vc_studio_agent_task_done_decreases_0_proved : vc_studio_agent_task_done_decreases_0 = 0 := rfl

end studio_agent_task_done

namespace studio_agent_cancel_btn_width_px

def vc_studio_agent_cancel_btn_width_px_requires_0 : Prop := True
theorem vc_studio_agent_cancel_btn_width_px_requires_0_proved : vc_studio_agent_cancel_btn_width_px_requires_0 := trivial
def vc_studio_agent_cancel_btn_width_px_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_cancel_btn_width_px_ensures_0_proved (result : Float) : vc_studio_agent_cancel_btn_width_px_ensures_0 result := trivial
def vc_studio_agent_cancel_btn_width_px_decreases_0 : Nat := 0
theorem vc_studio_agent_cancel_btn_width_px_decreases_0_proved : vc_studio_agent_cancel_btn_width_px_decreases_0 = 0 := rfl

end studio_agent_cancel_btn_width_px

namespace studio_agent_status_pad_px

def vc_studio_agent_status_pad_px_requires_0 : Prop := True
theorem vc_studio_agent_status_pad_px_requires_0_proved : vc_studio_agent_status_pad_px_requires_0 := trivial
def vc_studio_agent_status_pad_px_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_status_pad_px_ensures_0_proved (result : Float) : vc_studio_agent_status_pad_px_ensures_0 result := trivial
def vc_studio_agent_status_pad_px_decreases_0 : Nat := 0
theorem vc_studio_agent_status_pad_px_decreases_0_proved : vc_studio_agent_status_pad_px_decreases_0 = 0 := rfl

end studio_agent_status_pad_px

namespace studio_agent_error_strip_height_px

def vc_studio_agent_error_strip_height_px_requires_0 : Prop := True
theorem vc_studio_agent_error_strip_height_px_requires_0_proved : vc_studio_agent_error_strip_height_px_requires_0 := trivial
def vc_studio_agent_error_strip_height_px_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_error_strip_height_px_ensures_0_proved (result : Float) : vc_studio_agent_error_strip_height_px_ensures_0 result := trivial
def vc_studio_agent_error_strip_height_px_decreases_0 : Nat := 0
theorem vc_studio_agent_error_strip_height_px_decreases_0_proved : vc_studio_agent_error_strip_height_px_decreases_0 = 0 := rfl

end studio_agent_error_strip_height_px

namespace studio_dock_width_px

def vc_studio_dock_width_px_requires_0 : Prop := True
theorem vc_studio_dock_width_px_requires_0_proved : vc_studio_dock_width_px_requires_0 := trivial
def vc_studio_dock_width_px_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_dock_width_px_ensures_0_proved (result : Float) : vc_studio_dock_width_px_ensures_0 result := trivial
def vc_studio_dock_width_px_decreases_0 : Nat := 0
theorem vc_studio_dock_width_px_decreases_0_proved : vc_studio_dock_width_px_decreases_0 = 0 := rfl

end studio_dock_width_px

namespace studio_topbar_height_px

def vc_studio_topbar_height_px_requires_0 : Prop := True
theorem vc_studio_topbar_height_px_requires_0_proved : vc_studio_topbar_height_px_requires_0 := trivial
def vc_studio_topbar_height_px_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_topbar_height_px_ensures_0_proved (result : Float) : vc_studio_topbar_height_px_ensures_0 result := trivial
def vc_studio_topbar_height_px_decreases_0 : Nat := 0
theorem vc_studio_topbar_height_px_decreases_0_proved : vc_studio_topbar_height_px_decreases_0 = 0 := rfl

end studio_topbar_height_px

namespace studio_inspector_width_px

def vc_studio_inspector_width_px_requires_0 : Prop := True
theorem vc_studio_inspector_width_px_requires_0_proved : vc_studio_inspector_width_px_requires_0 := trivial
def vc_studio_inspector_width_px_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_inspector_width_px_ensures_0_proved (result : Float) : vc_studio_inspector_width_px_ensures_0 result := trivial
def vc_studio_inspector_width_px_decreases_0 : Nat := 0
theorem vc_studio_inspector_width_px_decreases_0_proved : vc_studio_inspector_width_px_decreases_0 = 0 := rfl

end studio_inspector_width_px

namespace studio_panel_transition_ms

def vc_studio_panel_transition_ms_requires_0 : Prop := True
theorem vc_studio_panel_transition_ms_requires_0_proved : vc_studio_panel_transition_ms_requires_0 := trivial
def vc_studio_panel_transition_ms_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_panel_transition_ms_ensures_0_proved (result : Float) : vc_studio_panel_transition_ms_ensures_0 result := trivial
def vc_studio_panel_transition_ms_decreases_0 : Nat := 0
theorem vc_studio_panel_transition_ms_decreases_0_proved : vc_studio_panel_transition_ms_decreases_0 = 0 := rfl

end studio_panel_transition_ms

namespace studio_command_palette_hint_len

def vc_studio_command_palette_hint_len_requires_0 : Prop := True
theorem vc_studio_command_palette_hint_len_requires_0_proved : vc_studio_command_palette_hint_len_requires_0 := trivial
def vc_studio_command_palette_hint_len_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_command_palette_hint_len_ensures_0_proved (result : Int) : vc_studio_command_palette_hint_len_ensures_0 result := trivial
def vc_studio_command_palette_hint_len_decreases_0 : Nat := 0
theorem vc_studio_command_palette_hint_len_decreases_0_proved : vc_studio_command_palette_hint_len_decreases_0 = 0 := rfl

end studio_command_palette_hint_len

namespace studio_palette_open_flag

def vc_studio_palette_open_flag_requires_0 : Prop := True
theorem vc_studio_palette_open_flag_requires_0_proved : vc_studio_palette_open_flag_requires_0 := trivial
def vc_studio_palette_open_flag_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_palette_open_flag_ensures_0_proved (result : Int) : vc_studio_palette_open_flag_ensures_0 result := trivial
def vc_studio_palette_open_flag_decreases_0 : Nat := 0
theorem vc_studio_palette_open_flag_decreases_0_proved : vc_studio_palette_open_flag_decreases_0 = 0 := rfl

end studio_palette_open_flag

namespace studio_palette_closed_flag

def vc_studio_palette_closed_flag_requires_0 : Prop := True
theorem vc_studio_palette_closed_flag_requires_0_proved : vc_studio_palette_closed_flag_requires_0 := trivial
def vc_studio_palette_closed_flag_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_palette_closed_flag_ensures_0_proved (result : Int) : vc_studio_palette_closed_flag_ensures_0 result := trivial
def vc_studio_palette_closed_flag_decreases_0 : Nat := 0
theorem vc_studio_palette_closed_flag_decreases_0_proved : vc_studio_palette_closed_flag_decreases_0 = 0 := rfl

end studio_palette_closed_flag

namespace studio_palette_panel_width_px

def vc_studio_palette_panel_width_px_requires_0 : Prop := True
theorem vc_studio_palette_panel_width_px_requires_0_proved : vc_studio_palette_panel_width_px_requires_0 := trivial
def vc_studio_palette_panel_width_px_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_palette_panel_width_px_ensures_0_proved (result : Float) : vc_studio_palette_panel_width_px_ensures_0 result := trivial
def vc_studio_palette_panel_width_px_decreases_0 : Nat := 0
theorem vc_studio_palette_panel_width_px_decreases_0_proved : vc_studio_palette_panel_width_px_decreases_0 = 0 := rfl

end studio_palette_panel_width_px

namespace studio_palette_panel_height_px

def vc_studio_palette_panel_height_px_requires_0 : Prop := True
theorem vc_studio_palette_panel_height_px_requires_0_proved : vc_studio_palette_panel_height_px_requires_0 := trivial
def vc_studio_palette_panel_height_px_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_palette_panel_height_px_ensures_0_proved (result : Float) : vc_studio_palette_panel_height_px_ensures_0 result := trivial
def vc_studio_palette_panel_height_px_decreases_0 : Nat := 0
theorem vc_studio_palette_panel_height_px_decreases_0_proved : vc_studio_palette_panel_height_px_decreases_0 = 0 := rfl

end studio_palette_panel_height_px

namespace studio_palette_search_bar_height_px

def vc_studio_palette_search_bar_height_px_requires_0 : Prop := True
theorem vc_studio_palette_search_bar_height_px_requires_0_proved : vc_studio_palette_search_bar_height_px_requires_0 := trivial
def vc_studio_palette_search_bar_height_px_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_palette_search_bar_height_px_ensures_0_proved (result : Float) : vc_studio_palette_search_bar_height_px_ensures_0 result := trivial
def vc_studio_palette_search_bar_height_px_decreases_0 : Nat := 0
theorem vc_studio_palette_search_bar_height_px_decreases_0_proved : vc_studio_palette_search_bar_height_px_decreases_0 = 0 := rfl

end studio_palette_search_bar_height_px

namespace studio_palette_result_count_stub

def vc_studio_palette_result_count_stub_requires_0 : Prop := True
theorem vc_studio_palette_result_count_stub_requires_0_proved : vc_studio_palette_result_count_stub_requires_0 := trivial
def vc_studio_palette_result_count_stub_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_palette_result_count_stub_ensures_0_proved (result : Int) : vc_studio_palette_result_count_stub_ensures_0 result := trivial
def vc_studio_palette_result_count_stub_decreases_0 : Nat := 0
theorem vc_studio_palette_result_count_stub_decreases_0_proved : vc_studio_palette_result_count_stub_decreases_0 = 0 := rfl

end studio_palette_result_count_stub

namespace studio_palette_action_none

def vc_studio_palette_action_none_requires_0 : Prop := True
theorem vc_studio_palette_action_none_requires_0_proved : vc_studio_palette_action_none_requires_0 := trivial
def vc_studio_palette_action_none_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_palette_action_none_ensures_0_proved (result : Int) : vc_studio_palette_action_none_ensures_0 result := trivial
def vc_studio_palette_action_none_decreases_0 : Nat := 0
theorem vc_studio_palette_action_none_decreases_0_proved : vc_studio_palette_action_none_decreases_0 = 0 := rfl

end studio_palette_action_none

namespace studio_palette_action_focus_inspector

def vc_studio_palette_action_focus_inspector_requires_0 : Prop := True
theorem vc_studio_palette_action_focus_inspector_requires_0_proved : vc_studio_palette_action_focus_inspector_requires_0 := trivial
def vc_studio_palette_action_focus_inspector_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_palette_action_focus_inspector_ensures_0_proved (result : Int) : vc_studio_palette_action_focus_inspector_ensures_0 result := trivial
def vc_studio_palette_action_focus_inspector_decreases_0 : Nat := 0
theorem vc_studio_palette_action_focus_inspector_decreases_0_proved : vc_studio_palette_action_focus_inspector_decreases_0 = 0 := rfl

end studio_palette_action_focus_inspector

namespace studio_palette_action_focus_timeline

def vc_studio_palette_action_focus_timeline_requires_0 : Prop := True
theorem vc_studio_palette_action_focus_timeline_requires_0_proved : vc_studio_palette_action_focus_timeline_requires_0 := trivial
def vc_studio_palette_action_focus_timeline_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_palette_action_focus_timeline_ensures_0_proved (result : Int) : vc_studio_palette_action_focus_timeline_ensures_0 result := trivial
def vc_studio_palette_action_focus_timeline_decreases_0 : Nat := 0
theorem vc_studio_palette_action_focus_timeline_decreases_0_proved : vc_studio_palette_action_focus_timeline_decreases_0 = 0 := rfl

end studio_palette_action_focus_timeline

namespace studio_palette_action_focus_agent

def vc_studio_palette_action_focus_agent_requires_0 : Prop := True
theorem vc_studio_palette_action_focus_agent_requires_0_proved : vc_studio_palette_action_focus_agent_requires_0 := trivial
def vc_studio_palette_action_focus_agent_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_palette_action_focus_agent_ensures_0_proved (result : Int) : vc_studio_palette_action_focus_agent_ensures_0 result := trivial
def vc_studio_palette_action_focus_agent_decreases_0 : Nat := 0
theorem vc_studio_palette_action_focus_agent_decreases_0_proved : vc_studio_palette_action_focus_agent_decreases_0 = 0 := rfl

end studio_palette_action_focus_agent

namespace studio_palette_action_for_slot

def vc_studio_palette_action_for_slot_requires_0 (slot : Int) : Prop := (slot ≥ 1)
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_palette_action_for_slot_requires_1 (slot : Int) : Prop := True
theorem vc_studio_palette_action_for_slot_requires_1_proved (slot : Int) : vc_studio_palette_action_for_slot_requires_1 slot := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_action_for_slot_ensures_0 (slot : Int) (result : Int) : Prop := True
theorem vc_studio_palette_action_for_slot_ensures_0_proved (slot : Int) (result : Int) : vc_studio_palette_action_for_slot_ensures_0 slot result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_action_for_slot_ensures_1 (slot : Int) (result : Int) : Prop := True
theorem vc_studio_palette_action_for_slot_ensures_1_proved (slot : Int) (result : Int) : vc_studio_palette_action_for_slot_ensures_1 slot result := trivial
def vc_studio_palette_action_for_slot_decreases_0 (slot : Int) : Nat := Int.toNat slot
theorem vc_studio_palette_action_for_slot_decreases_0_proved (slot : Int) : vc_studio_palette_action_for_slot_decreases_0 slot = Int.toNat slot := rfl
def vc_studio_palette_action_for_slot_call0_studio_palette_action_focus_inspector_requires_0 (slot : Int) : Prop := True
theorem vc_studio_palette_action_for_slot_call0_studio_palette_action_focus_inspector_requires_0_proved (slot : Int) : vc_studio_palette_action_for_slot_call0_studio_palette_action_focus_inspector_requires_0 slot := trivial
def vc_studio_palette_action_for_slot_call1_studio_palette_action_focus_timeline_requires_0 (slot : Int) : Prop := True
theorem vc_studio_palette_action_for_slot_call1_studio_palette_action_focus_timeline_requires_0_proved (slot : Int) : vc_studio_palette_action_for_slot_call1_studio_palette_action_focus_timeline_requires_0 slot := trivial
def vc_studio_palette_action_for_slot_call2_studio_palette_action_focus_agent_requires_0 (slot : Int) : Prop := True
theorem vc_studio_palette_action_for_slot_call2_studio_palette_action_focus_agent_requires_0_proved (slot : Int) : vc_studio_palette_action_for_slot_call2_studio_palette_action_focus_agent_requires_0 slot := trivial

end studio_palette_action_for_slot

namespace studio_palette_backdrop_rect_at

def vc_studio_palette_backdrop_rect_at_requires_0 (w : Float) (h : Float) : Prop := (w > (0 : Float))
def vc_studio_palette_backdrop_rect_at_requires_1 (w : Float) (h : Float) : Prop := (h > (0 : Float))
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_backdrop_rect_at_ensures_0 (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_studio_palette_backdrop_rect_at_ensures_0_proved (w : Float) (h : Float) (result : Int) : vc_studio_palette_backdrop_rect_at_ensures_0 w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_backdrop_rect_at_ensures_1 (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_studio_palette_backdrop_rect_at_ensures_1_proved (w : Float) (h : Float) (result : Int) : vc_studio_palette_backdrop_rect_at_ensures_1 w h result := trivial
def vc_studio_palette_backdrop_rect_at_decreases_0 (w : Float) (h : Float) : Nat := 0
theorem vc_studio_palette_backdrop_rect_at_decreases_0_proved (w : Float) (h : Float) : vc_studio_palette_backdrop_rect_at_decreases_0 w h = 0 := rfl
def vc_studio_palette_backdrop_rect_at_call0_rect_make_requires_0 (w : Float) (h : Float) : Prop := (w ≥ (0 : Float))
def vc_studio_palette_backdrop_rect_at_call0_rect_make_requires_1 (w : Float) (h : Float) : Prop := (h ≥ (0 : Float))

end studio_palette_backdrop_rect_at

namespace studio_palette_panel_rect_at

def vc_studio_palette_panel_rect_at_requires_0 (w : Float) (h : Float) : Prop := (w > (0 : Float))
def vc_studio_palette_panel_rect_at_requires_1 (w : Float) (h : Float) : Prop := (h > (0 : Float))
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_panel_rect_at_ensures_0 (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_studio_palette_panel_rect_at_ensures_0_proved (w : Float) (h : Float) (result : Int) : vc_studio_palette_panel_rect_at_ensures_0 w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_panel_rect_at_ensures_1 (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_studio_palette_panel_rect_at_ensures_1_proved (w : Float) (h : Float) (result : Int) : vc_studio_palette_panel_rect_at_ensures_1 w h result := trivial
def vc_studio_palette_panel_rect_at_decreases_0 (w : Float) (h : Float) : Nat := 0
theorem vc_studio_palette_panel_rect_at_decreases_0_proved (w : Float) (h : Float) : vc_studio_palette_panel_rect_at_decreases_0 w h = 0 := rfl
def vc_studio_palette_panel_rect_at_call0_studio_palette_panel_width_px_requires_0 (w : Float) (h : Float) : Prop := True
theorem vc_studio_palette_panel_rect_at_call0_studio_palette_panel_width_px_requires_0_proved (w : Float) (h : Float) : vc_studio_palette_panel_rect_at_call0_studio_palette_panel_width_px_requires_0 w h := trivial
def vc_studio_palette_panel_rect_at_call1_studio_palette_panel_height_px_requires_0 (w : Float) (h : Float) : Prop := True
theorem vc_studio_palette_panel_rect_at_call1_studio_palette_panel_height_px_requires_0_proved (w : Float) (h : Float) : vc_studio_palette_panel_rect_at_call1_studio_palette_panel_height_px_requires_0 w h := trivial
def vc_studio_palette_panel_rect_at_call2_rect_make_requires_0 (w : Float) (h : Float) (pw : Float) : Prop := (pw ≥ (0 : Float))
def vc_studio_palette_panel_rect_at_call2_rect_make_requires_1 (w : Float) (h : Float) (ph : Float) : Prop := (ph ≥ (0 : Float))

end studio_palette_panel_rect_at

namespace studio_palette_search_rect_at

/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_palette_search_rect_at_requires_0 (panel : Int) : Prop := True
theorem vc_studio_palette_search_rect_at_requires_0_proved (panel : Int) : vc_studio_palette_search_rect_at_requires_0 panel := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_palette_search_rect_at_requires_1 (panel : Int) : Prop := True
theorem vc_studio_palette_search_rect_at_requires_1_proved (panel : Int) : vc_studio_palette_search_rect_at_requires_1 panel := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_search_rect_at_ensures_0 (panel : Int) (result : Int) : Prop := True
theorem vc_studio_palette_search_rect_at_ensures_0_proved (panel : Int) (result : Int) : vc_studio_palette_search_rect_at_ensures_0 panel result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_search_rect_at_ensures_1 (panel : Int) (result : Int) : Prop := True
theorem vc_studio_palette_search_rect_at_ensures_1_proved (panel : Int) (result : Int) : vc_studio_palette_search_rect_at_ensures_1 panel result := trivial
def vc_studio_palette_search_rect_at_decreases_0 (panel : Int) : Nat := 0
theorem vc_studio_palette_search_rect_at_decreases_0_proved (panel : Int) : vc_studio_palette_search_rect_at_decreases_0 panel = 0 := rfl
/-! VC call-site requires (opaque): callee 'rect_make' at call 0 -/
def vc_studio_palette_search_rect_at_call0_rect_make_requires_0 (panel : Int) (pad : Float) : Prop := True
/-! VC call-site requires (opaque): callee 'rect_make' at call 0 -/
def vc_studio_palette_search_rect_at_call0_rect_make_requires_1 (panel : Int) : Prop := True
def vc_studio_palette_search_rect_at_call1_studio_palette_search_bar_height_px_requires_0 (panel : Int) : Prop := True
theorem vc_studio_palette_search_rect_at_call1_studio_palette_search_bar_height_px_requires_0_proved (panel : Int) : vc_studio_palette_search_rect_at_call1_studio_palette_search_bar_height_px_requires_0 panel := trivial

end studio_palette_search_rect_at

namespace studio_compose_palette

def vc_studio_compose_palette_requires_0 (w : Float) (h : Float) (is_open : Int) : Prop := (w > (0 : Float))
def vc_studio_compose_palette_requires_1 (w : Float) (h : Float) (is_open : Int) : Prop := (h > (0 : Float))
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_compose_palette_requires_2 (w : Float) (h : Float) (is_open : Int) : Prop := True
theorem vc_studio_compose_palette_requires_2_proved (w : Float) (h : Float) (is_open : Int) : vc_studio_compose_palette_requires_2 w h is_open := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_compose_palette_requires_3 (w : Float) (h : Float) (is_open : Int) : Prop := True
theorem vc_studio_compose_palette_requires_3_proved (w : Float) (h : Float) (is_open : Int) : vc_studio_compose_palette_requires_3 w h is_open := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_compose_palette_ensures_0 (w : Float) (h : Float) (is_open : Int) (result : Int) : Prop := True
theorem vc_studio_compose_palette_ensures_0_proved (w : Float) (h : Float) (is_open : Int) (result : Int) : vc_studio_compose_palette_ensures_0 w h is_open result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_compose_palette_ensures_1 (w : Float) (h : Float) (is_open : Int) (result : Int) : Prop := True
theorem vc_studio_compose_palette_ensures_1_proved (w : Float) (h : Float) (is_open : Int) (result : Int) : vc_studio_compose_palette_ensures_1 w h is_open result := trivial
def vc_studio_compose_palette_decreases_0 (w : Float) (h : Float) (is_open : Int) : Nat := Int.toNat is_open
theorem vc_studio_compose_palette_decreases_0_proved (w : Float) (h : Float) (is_open : Int) : vc_studio_compose_palette_decreases_0 w h is_open = Int.toNat is_open := rfl
def vc_studio_compose_palette_call0_rect_make_requires_0 (w : Float) (h : Float) (is_open : Int) : Prop := ((0 : Float) ≥ (0 : Float))
def vc_studio_compose_palette_call0_rect_make_requires_1 (w : Float) (h : Float) (is_open : Int) : Prop := ((0 : Float) ≥ (0 : Float))
def vc_studio_compose_palette_call1_rect_make_requires_0 (w : Float) (h : Float) (is_open : Int) : Prop := ((0 : Float) ≥ (0 : Float))
def vc_studio_compose_palette_call1_rect_make_requires_1 (w : Float) (h : Float) (is_open : Int) : Prop := ((0 : Float) ≥ (0 : Float))
def vc_studio_compose_palette_call2_rect_make_requires_0 (w : Float) (h : Float) (is_open : Int) : Prop := ((0 : Float) ≥ (0 : Float))
def vc_studio_compose_palette_call2_rect_make_requires_1 (w : Float) (h : Float) (is_open : Int) : Prop := ((0 : Float) ≥ (0 : Float))
def vc_studio_compose_palette_call3_studio_palette_action_none_requires_0 (w : Float) (h : Float) (is_open : Int) : Prop := True
theorem vc_studio_compose_palette_call3_studio_palette_action_none_requires_0_proved (w : Float) (h : Float) (is_open : Int) : vc_studio_compose_palette_call3_studio_palette_action_none_requires_0 w h is_open := trivial
def vc_studio_compose_palette_call4_studio_palette_open_flag_requires_0 (w : Float) (h : Float) (is_open : Int) : Prop := True
theorem vc_studio_compose_palette_call4_studio_palette_open_flag_requires_0_proved (w : Float) (h : Float) (is_open : Int) : vc_studio_compose_palette_call4_studio_palette_open_flag_requires_0 w h is_open := trivial
def vc_studio_compose_palette_call5_studio_palette_backdrop_rect_at_requires_0 (w : Float) (h : Float) (is_open : Int) (backdrop_w : Float) : Prop := (backdrop_w > (0 : Float))
def vc_studio_compose_palette_call5_studio_palette_backdrop_rect_at_requires_1 (w : Float) (h : Float) (is_open : Int) (backdrop_h : Float) : Prop := (backdrop_h > (0 : Float))
def vc_studio_compose_palette_call6_studio_palette_panel_rect_at_requires_0 (w : Float) (h : Float) (is_open : Int) (panel_w : Float) : Prop := (panel_w > (0 : Float))
def vc_studio_compose_palette_call6_studio_palette_panel_rect_at_requires_1 (w : Float) (h : Float) (is_open : Int) (panel_h : Float) : Prop := (panel_h > (0 : Float))
/-! VC call-site requires (opaque): callee 'rect_make' at call 7 -/
def vc_studio_compose_palette_call7_rect_make_requires_0 (w : Float) (h : Float) (is_open : Int) (out : Int) (search_pad : Float) : Prop := True
/-! VC call-site requires (opaque): callee 'rect_make' at call 7 -/
def vc_studio_compose_palette_call7_rect_make_requires_1 (w : Float) (h : Float) (is_open : Int) : Prop := True
def vc_studio_compose_palette_call8_studio_palette_search_bar_height_px_requires_0 (w : Float) (h : Float) (is_open : Int) : Prop := True
theorem vc_studio_compose_palette_call8_studio_palette_search_bar_height_px_requires_0_proved (w : Float) (h : Float) (is_open : Int) : vc_studio_compose_palette_call8_studio_palette_search_bar_height_px_requires_0 w h is_open := trivial
def vc_studio_compose_palette_call9_studio_palette_result_count_stub_requires_0 (w : Float) (h : Float) (is_open : Int) : Prop := True
theorem vc_studio_compose_palette_call9_studio_palette_result_count_stub_requires_0_proved (w : Float) (h : Float) (is_open : Int) : vc_studio_compose_palette_call9_studio_palette_result_count_stub_requires_0 w h is_open := trivial

end studio_compose_palette

namespace studio_palette_open

def vc_studio_palette_open_requires_0 (palette : Int) (w : Float) (h : Float) : Prop := (w > (0 : Float))
def vc_studio_palette_open_requires_1 (palette : Int) (w : Float) (h : Float) : Prop := (h > (0 : Float))
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_palette_open_requires_2 (palette : Int) (w : Float) (h : Float) : Prop := True
theorem vc_studio_palette_open_requires_2_proved (palette : Int) (w : Float) (h : Float) : vc_studio_palette_open_requires_2 palette w h := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_open_ensures_0 (palette : Int) (w : Float) (h : Float) (result : Unit) : Prop := True
theorem vc_studio_palette_open_ensures_0_proved (palette : Int) (w : Float) (h : Float) (result : Unit) : vc_studio_palette_open_ensures_0 palette w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_open_ensures_1 (palette : Int) (w : Float) (h : Float) (result : Unit) : Prop := True
theorem vc_studio_palette_open_ensures_1_proved (palette : Int) (w : Float) (h : Float) (result : Unit) : vc_studio_palette_open_ensures_1 palette w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_open_ensures_2 (palette : Int) (w : Float) (h : Float) (result : Unit) : Prop := True
theorem vc_studio_palette_open_ensures_2_proved (palette : Int) (w : Float) (h : Float) (result : Unit) : vc_studio_palette_open_ensures_2 palette w h result := trivial
def vc_studio_palette_open_decreases_0 (palette : Int) (w : Float) (h : Float) : Nat := 0
theorem vc_studio_palette_open_decreases_0_proved (palette : Int) (w : Float) (h : Float) : vc_studio_palette_open_decreases_0 palette w h = 0 := rfl
def vc_studio_palette_open_call0_studio_compose_palette_requires_0 (palette : Int) (w : Float) (h : Float) (open_w : Float) : Prop := (open_w > (0 : Float))
def vc_studio_palette_open_call0_studio_compose_palette_requires_1 (palette : Int) (w : Float) (h : Float) (open_h : Float) : Prop := (open_h > (0 : Float))
/-! VC call-site requires (opaque): callee 'studio_compose_palette' at call 0 -/
def vc_studio_palette_open_call0_studio_compose_palette_requires_2 (palette : Int) (w : Float) (h : Float) : Prop := True
/-! VC call-site requires (opaque): callee 'studio_compose_palette' at call 0 -/
def vc_studio_palette_open_call0_studio_compose_palette_requires_3 (palette : Int) (w : Float) (h : Float) : Prop := True
def vc_studio_palette_open_call1_studio_palette_open_flag_requires_0 (palette : Int) (w : Float) (h : Float) : Prop := True
theorem vc_studio_palette_open_call1_studio_palette_open_flag_requires_0_proved (palette : Int) (w : Float) (h : Float) : vc_studio_palette_open_call1_studio_palette_open_flag_requires_0 palette w h := trivial
def vc_studio_palette_open_call2_studio_palette_action_none_requires_0 (palette : Int) (w : Float) (h : Float) : Prop := True
theorem vc_studio_palette_open_call2_studio_palette_action_none_requires_0_proved (palette : Int) (w : Float) (h : Float) : vc_studio_palette_open_call2_studio_palette_action_none_requires_0 palette w h := trivial

end studio_palette_open

namespace studio_palette_close

/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_palette_close_requires_0 (palette : Int) : Prop := True
theorem vc_studio_palette_close_requires_0_proved (palette : Int) : vc_studio_palette_close_requires_0 palette := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_close_ensures_0 (palette : Int) (result : Unit) : Prop := True
theorem vc_studio_palette_close_ensures_0_proved (palette : Int) (result : Unit) : vc_studio_palette_close_ensures_0 palette result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_close_ensures_1 (palette : Int) (result : Unit) : Prop := True
theorem vc_studio_palette_close_ensures_1_proved (palette : Int) (result : Unit) : vc_studio_palette_close_ensures_1 palette result := trivial
def vc_studio_palette_close_decreases_0 (palette : Int) : Nat := 0
theorem vc_studio_palette_close_decreases_0_proved (palette : Int) : vc_studio_palette_close_decreases_0 palette = 0 := rfl
def vc_studio_palette_close_call0_studio_palette_closed_flag_requires_0 (palette : Int) : Prop := True
theorem vc_studio_palette_close_call0_studio_palette_closed_flag_requires_0_proved (palette : Int) : vc_studio_palette_close_call0_studio_palette_closed_flag_requires_0 palette := trivial
def vc_studio_palette_close_call1_rect_make_requires_0 (palette : Int) : Prop := ((0 : Float) ≥ (0 : Float))
def vc_studio_palette_close_call1_rect_make_requires_1 (palette : Int) : Prop := ((0 : Float) ≥ (0 : Float))
def vc_studio_palette_close_call2_rect_make_requires_0 (palette : Int) : Prop := ((0 : Float) ≥ (0 : Float))
def vc_studio_palette_close_call2_rect_make_requires_1 (palette : Int) : Prop := ((0 : Float) ≥ (0 : Float))
def vc_studio_palette_close_call3_rect_make_requires_0 (palette : Int) : Prop := ((0 : Float) ≥ (0 : Float))
def vc_studio_palette_close_call3_rect_make_requires_1 (palette : Int) : Prop := ((0 : Float) ≥ (0 : Float))

end studio_palette_close

namespace studio_palette_exec_slot

def vc_studio_palette_exec_slot_requires_0 (palette : Int) (slot : Int) : Prop := (slot ≥ 1)
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_palette_exec_slot_requires_1 (palette : Int) (slot : Int) : Prop := True
theorem vc_studio_palette_exec_slot_requires_1_proved (palette : Int) (slot : Int) : vc_studio_palette_exec_slot_requires_1 palette slot := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_palette_exec_slot_requires_2 (palette : Int) (slot : Int) : Prop := True
theorem vc_studio_palette_exec_slot_requires_2_proved (palette : Int) (slot : Int) : vc_studio_palette_exec_slot_requires_2 palette slot := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_exec_slot_ensures_0 (palette : Int) (slot : Int) (result : Int) : Prop := True
theorem vc_studio_palette_exec_slot_ensures_0_proved (palette : Int) (slot : Int) (result : Int) : vc_studio_palette_exec_slot_ensures_0 palette slot result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_exec_slot_ensures_1 (palette : Int) (slot : Int) (result : Int) : Prop := True
theorem vc_studio_palette_exec_slot_ensures_1_proved (palette : Int) (slot : Int) (result : Int) : vc_studio_palette_exec_slot_ensures_1 palette slot result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_exec_slot_ensures_2 (palette : Int) (slot : Int) (result : Int) : Prop := True
theorem vc_studio_palette_exec_slot_ensures_2_proved (palette : Int) (slot : Int) (result : Int) : vc_studio_palette_exec_slot_ensures_2 palette slot result := trivial
def vc_studio_palette_exec_slot_decreases_0 (palette : Int) (slot : Int) : Nat := Int.toNat slot
theorem vc_studio_palette_exec_slot_decreases_0_proved (palette : Int) (slot : Int) : vc_studio_palette_exec_slot_decreases_0 palette slot = Int.toNat slot := rfl
def vc_studio_palette_exec_slot_call0_studio_palette_action_for_slot_requires_0 (palette : Int) (slot : Int) : Prop := (slot ≥ 1)
/-! VC call-site requires (opaque): callee 'studio_palette_action_for_slot' at call 0 -/
def vc_studio_palette_exec_slot_call0_studio_palette_action_for_slot_requires_1 (palette : Int) (slot : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'studio_palette_close' at call 1 -/
def vc_studio_palette_exec_slot_call1_studio_palette_close_requires_0 (palette : Int) (slot : Int) : Prop := True

end studio_palette_exec_slot

namespace studio_palette_toggle

def vc_studio_palette_toggle_requires_0 (palette : Int) (w : Float) (h : Float) : Prop := (w > (0 : Float))
def vc_studio_palette_toggle_requires_1 (palette : Int) (w : Float) (h : Float) : Prop := (h > (0 : Float))
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_palette_toggle_requires_2 (palette : Int) (w : Float) (h : Float) : Prop := True
theorem vc_studio_palette_toggle_requires_2_proved (palette : Int) (w : Float) (h : Float) : vc_studio_palette_toggle_requires_2 palette w h := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_palette_toggle_requires_3 (palette : Int) (w : Float) (h : Float) : Prop := True
theorem vc_studio_palette_toggle_requires_3_proved (palette : Int) (w : Float) (h : Float) : vc_studio_palette_toggle_requires_3 palette w h := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_toggle_ensures_0 (palette : Int) (w : Float) (h : Float) (result : Unit) : Prop := True
theorem vc_studio_palette_toggle_ensures_0_proved (palette : Int) (w : Float) (h : Float) (result : Unit) : vc_studio_palette_toggle_ensures_0 palette w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_palette_toggle_ensures_1 (palette : Int) (w : Float) (h : Float) (result : Unit) : Prop := True
theorem vc_studio_palette_toggle_ensures_1_proved (palette : Int) (w : Float) (h : Float) (result : Unit) : vc_studio_palette_toggle_ensures_1 palette w h result := trivial
def vc_studio_palette_toggle_decreases_0 (palette : Int) (w : Float) (h : Float) : Nat := 0
theorem vc_studio_palette_toggle_decreases_0_proved (palette : Int) (w : Float) (h : Float) : vc_studio_palette_toggle_decreases_0 palette w h = 0 := rfl
def vc_studio_palette_toggle_call0_studio_palette_open_flag_requires_0 (palette : Int) (w : Float) (h : Float) : Prop := True
theorem vc_studio_palette_toggle_call0_studio_palette_open_flag_requires_0_proved (palette : Int) (w : Float) (h : Float) : vc_studio_palette_toggle_call0_studio_palette_open_flag_requires_0 palette w h := trivial
/-! VC call-site requires (opaque): callee 'studio_palette_close' at call 1 -/
def vc_studio_palette_toggle_call1_studio_palette_close_requires_0 (palette : Int) (w : Float) (h : Float) : Prop := True
def vc_studio_palette_toggle_call2_studio_palette_open_requires_0 (palette : Int) (w : Float) (h : Float) (toggle_w : Float) : Prop := (toggle_w > (0 : Float))
def vc_studio_palette_toggle_call2_studio_palette_open_requires_1 (palette : Int) (w : Float) (h : Float) (toggle_h : Float) : Prop := (toggle_h > (0 : Float))
/-! VC call-site requires (opaque): callee 'studio_palette_open' at call 2 -/
def vc_studio_palette_toggle_call2_studio_palette_open_requires_2 (palette : Int) (w : Float) (h : Float) : Prop := True

end studio_palette_toggle

namespace studio_palette_ok

/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_palette_ok_requires_0 (palette : Int) : Prop := True
theorem vc_studio_palette_ok_requires_0_proved (palette : Int) : vc_studio_palette_ok_requires_0 palette := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_palette_ok_requires_1 (palette : Int) : Prop := True
theorem vc_studio_palette_ok_requires_1_proved (palette : Int) : vc_studio_palette_ok_requires_1 palette := trivial
def vc_studio_palette_ok_ensures_0 (palette : Int) (result : Int) : Prop := (result ≥ 0)
def vc_studio_palette_ok_ensures_1 (palette : Int) (result : Int) : Prop := (result ≤ 1)
def vc_studio_palette_ok_decreases_0 (palette : Int) : Nat := 0
theorem vc_studio_palette_ok_decreases_0_proved (palette : Int) : vc_studio_palette_ok_decreases_0 palette = 0 := rfl
def vc_studio_palette_ok_call0_studio_palette_closed_flag_requires_0 (palette : Int) : Prop := True
theorem vc_studio_palette_ok_call0_studio_palette_closed_flag_requires_0_proved (palette : Int) : vc_studio_palette_ok_call0_studio_palette_closed_flag_requires_0 palette := trivial
def vc_studio_palette_ok_call1_studio_palette_panel_width_px_requires_0 (palette : Int) : Prop := True
theorem vc_studio_palette_ok_call1_studio_palette_panel_width_px_requires_0_proved (palette : Int) : vc_studio_palette_ok_call1_studio_palette_panel_width_px_requires_0 palette := trivial
def vc_studio_palette_ok_call2_studio_palette_search_bar_height_px_requires_0 (palette : Int) : Prop := True
theorem vc_studio_palette_ok_call2_studio_palette_search_bar_height_px_requires_0_proved (palette : Int) : vc_studio_palette_ok_call2_studio_palette_search_bar_height_px_requires_0 palette := trivial
def vc_studio_palette_ok_call3_studio_palette_result_count_stub_requires_0 (palette : Int) : Prop := True
theorem vc_studio_palette_ok_call3_studio_palette_result_count_stub_requires_0_proved (palette : Int) : vc_studio_palette_ok_call3_studio_palette_result_count_stub_requires_0 palette := trivial

end studio_palette_ok

namespace studio_paint_palette_cmds

/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_paint_palette_cmds_requires_0 (is_open : Int) : Prop := True
theorem vc_studio_paint_palette_cmds_requires_0_proved (is_open : Int) : vc_studio_paint_palette_cmds_requires_0 is_open := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_paint_palette_cmds_requires_1 (is_open : Int) : Prop := True
theorem vc_studio_paint_palette_cmds_requires_1_proved (is_open : Int) : vc_studio_paint_palette_cmds_requires_1 is_open := trivial
def vc_studio_paint_palette_cmds_ensures_0 (is_open : Int) (result : Int) : Prop := (result ≥ 0)
def vc_studio_paint_palette_cmds_ensures_1 (is_open : Int) (result : Int) : Prop := (result ≤ 3)
def vc_studio_paint_palette_cmds_decreases_0 (is_open : Int) : Nat := Int.toNat is_open
theorem vc_studio_paint_palette_cmds_decreases_0_proved (is_open : Int) : vc_studio_paint_palette_cmds_decreases_0 is_open = Int.toNat is_open := rfl
def vc_studio_paint_palette_cmds_call0_studio_palette_closed_flag_requires_0 (is_open : Int) : Prop := True
theorem vc_studio_paint_palette_cmds_call0_studio_palette_closed_flag_requires_0_proved (is_open : Int) : vc_studio_paint_palette_cmds_call0_studio_palette_closed_flag_requires_0 is_open := trivial

end studio_paint_palette_cmds

namespace paint_studio_palette

/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_studio_palette_requires_0 (frame : Int) (palette : Int) : Prop := True
theorem vc_paint_studio_palette_requires_0_proved (frame : Int) (palette : Int) : vc_paint_studio_palette_requires_0 frame palette := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_studio_palette_requires_1 (frame : Int) (palette : Int) : Prop := True
theorem vc_paint_studio_palette_requires_1_proved (frame : Int) (palette : Int) : vc_paint_studio_palette_requires_1 frame palette := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_studio_palette_requires_2 (frame : Int) (palette : Int) : Prop := True
theorem vc_paint_studio_palette_requires_2_proved (frame : Int) (palette : Int) : vc_paint_studio_palette_requires_2 frame palette := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_paint_studio_palette_ensures_0 (frame : Int) (palette : Int) (result : Unit) : Prop := True
theorem vc_paint_studio_palette_ensures_0_proved (frame : Int) (palette : Int) (result : Unit) : vc_paint_studio_palette_ensures_0 frame palette result := trivial
def vc_paint_studio_palette_decreases_0 (frame : Int) (palette : Int) : Nat := 0
theorem vc_paint_studio_palette_decreases_0_proved (frame : Int) (palette : Int) : vc_paint_studio_palette_decreases_0 frame palette = 0 := rfl
def vc_paint_studio_palette_call0_studio_palette_closed_flag_requires_0 (frame : Int) (palette : Int) : Prop := True
theorem vc_paint_studio_palette_call0_studio_palette_closed_flag_requires_0_proved (frame : Int) (palette : Int) : vc_paint_studio_palette_call0_studio_palette_closed_flag_requires_0 frame palette := trivial
def vc_paint_studio_palette_call1_paint_op_fill_rect_requires_0 (frame : Int) (palette : Int) : Prop := True
theorem vc_paint_studio_palette_call1_paint_op_fill_rect_requires_0_proved (frame : Int) (palette : Int) : vc_paint_studio_palette_call1_paint_op_fill_rect_requires_0 frame palette := trivial
def vc_paint_studio_palette_call2_color_rgb_requires_0 (frame : Int) (palette : Int) : Prop := ((0.051 : Float) ≥ (0 : Float))
def vc_paint_studio_palette_call2_color_rgb_requires_1 (frame : Int) (palette : Int) : Prop := ((0.067 : Float) ≥ (0 : Float))
def vc_paint_studio_palette_call2_color_rgb_requires_2 (frame : Int) (palette : Int) : Prop := ((0.09 : Float) ≥ (0 : Float))
def vc_paint_studio_palette_call2_color_rgb_requires_3 (frame : Int) (palette : Int) : Prop := ((0.72 : Float) ≥ (0 : Float))
def vc_paint_studio_palette_call2_color_rgb_requires_4 (frame : Int) (palette : Int) : Prop := ((0.72 : Float) ≤ (1 : Float))
def vc_paint_studio_palette_call3_paint_op_fill_rect_requires_0 (frame : Int) (palette : Int) : Prop := True
theorem vc_paint_studio_palette_call3_paint_op_fill_rect_requires_0_proved (frame : Int) (palette : Int) : vc_paint_studio_palette_call3_paint_op_fill_rect_requires_0 frame palette := trivial
def vc_paint_studio_palette_call4_studio_color_bg_elevated_requires_0 (frame : Int) (palette : Int) : Prop := True
theorem vc_paint_studio_palette_call4_studio_color_bg_elevated_requires_0_proved (frame : Int) (palette : Int) : vc_paint_studio_palette_call4_studio_color_bg_elevated_requires_0 frame palette := trivial
def vc_paint_studio_palette_call5_paint_op_stroke_rect_requires_0 (frame : Int) (palette : Int) : Prop := True
theorem vc_paint_studio_palette_call5_paint_op_stroke_rect_requires_0_proved (frame : Int) (palette : Int) : vc_paint_studio_palette_call5_paint_op_stroke_rect_requires_0 frame palette := trivial
def vc_paint_studio_palette_call6_studio_color_accent_cyan_requires_0 (frame : Int) (palette : Int) : Prop := True
theorem vc_paint_studio_palette_call6_studio_color_accent_cyan_requires_0_proved (frame : Int) (palette : Int) : vc_paint_studio_palette_call6_studio_color_accent_cyan_requires_0 frame palette := trivial

end paint_studio_palette

namespace paint_studio_palette_count

/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_studio_palette_count_requires_0 (is_open : Int) : Prop := True
theorem vc_paint_studio_palette_count_requires_0_proved (is_open : Int) : vc_paint_studio_palette_count_requires_0 is_open := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_studio_palette_count_requires_1 (is_open : Int) : Prop := True
theorem vc_paint_studio_palette_count_requires_1_proved (is_open : Int) : vc_paint_studio_palette_count_requires_1 is_open := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_paint_studio_palette_count_ensures_0 (is_open : Int) (result : Int) : Prop := True
theorem vc_paint_studio_palette_count_ensures_0_proved (is_open : Int) (result : Int) : vc_paint_studio_palette_count_ensures_0 is_open result := trivial
def vc_paint_studio_palette_count_decreases_0 (is_open : Int) : Nat := Int.toNat is_open
theorem vc_paint_studio_palette_count_decreases_0_proved (is_open : Int) : vc_paint_studio_palette_count_decreases_0 is_open = Int.toNat is_open := rfl
/-! VC call-site requires (opaque): callee 'studio_paint_palette_cmds' at call 0 -/
def vc_paint_studio_palette_count_call0_studio_paint_palette_cmds_requires_0 (is_open : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'studio_paint_palette_cmds' at call 0 -/
def vc_paint_studio_palette_count_call0_studio_paint_palette_cmds_requires_1 (is_open : Int) : Prop := True

end paint_studio_palette_count

namespace studio_region_dock

def vc_studio_region_dock_requires_0 : Prop := True
theorem vc_studio_region_dock_requires_0_proved : vc_studio_region_dock_requires_0 := trivial
def vc_studio_region_dock_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_region_dock_ensures_0_proved (result : Int) : vc_studio_region_dock_ensures_0 result := trivial
def vc_studio_region_dock_decreases_0 : Nat := 0
theorem vc_studio_region_dock_decreases_0_proved : vc_studio_region_dock_decreases_0 = 0 := rfl

end studio_region_dock

namespace studio_region_topbar

def vc_studio_region_topbar_requires_0 : Prop := True
theorem vc_studio_region_topbar_requires_0_proved : vc_studio_region_topbar_requires_0 := trivial
def vc_studio_region_topbar_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_region_topbar_ensures_0_proved (result : Int) : vc_studio_region_topbar_ensures_0 result := trivial
def vc_studio_region_topbar_decreases_0 : Nat := 0
theorem vc_studio_region_topbar_decreases_0_proved : vc_studio_region_topbar_decreases_0 = 0 := rfl

end studio_region_topbar

namespace studio_region_viewport

def vc_studio_region_viewport_requires_0 : Prop := True
theorem vc_studio_region_viewport_requires_0_proved : vc_studio_region_viewport_requires_0 := trivial
def vc_studio_region_viewport_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_region_viewport_ensures_0_proved (result : Int) : vc_studio_region_viewport_ensures_0 result := trivial
def vc_studio_region_viewport_decreases_0 : Nat := 0
theorem vc_studio_region_viewport_decreases_0_proved : vc_studio_region_viewport_decreases_0 = 0 := rfl

end studio_region_viewport

namespace studio_region_inspector

def vc_studio_region_inspector_requires_0 : Prop := True
theorem vc_studio_region_inspector_requires_0_proved : vc_studio_region_inspector_requires_0 := trivial
def vc_studio_region_inspector_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_region_inspector_ensures_0_proved (result : Int) : vc_studio_region_inspector_ensures_0 result := trivial
def vc_studio_region_inspector_decreases_0 : Nat := 0
theorem vc_studio_region_inspector_decreases_0_proved : vc_studio_region_inspector_decreases_0 = 0 := rfl

end studio_region_inspector

namespace studio_region_timeline

def vc_studio_region_timeline_requires_0 : Prop := True
theorem vc_studio_region_timeline_requires_0_proved : vc_studio_region_timeline_requires_0 := trivial
def vc_studio_region_timeline_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_region_timeline_ensures_0_proved (result : Int) : vc_studio_region_timeline_ensures_0 result := trivial
def vc_studio_region_timeline_decreases_0 : Nat := 0
theorem vc_studio_region_timeline_decreases_0_proved : vc_studio_region_timeline_decreases_0 = 0 := rfl

end studio_region_timeline

namespace studio_region_agent_strip

def vc_studio_region_agent_strip_requires_0 : Prop := True
theorem vc_studio_region_agent_strip_requires_0_proved : vc_studio_region_agent_strip_requires_0 := trivial
def vc_studio_region_agent_strip_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_region_agent_strip_ensures_0_proved (result : Int) : vc_studio_region_agent_strip_ensures_0 result := trivial
def vc_studio_region_agent_strip_decreases_0 : Nat := 0
theorem vc_studio_region_agent_strip_decreases_0_proved : vc_studio_region_agent_strip_decreases_0 = 0 := rfl

end studio_region_agent_strip

namespace studio_timeline_height_px

def vc_studio_timeline_height_px_requires_0 : Prop := True
theorem vc_studio_timeline_height_px_requires_0_proved : vc_studio_timeline_height_px_requires_0 := trivial
def vc_studio_timeline_height_px_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_timeline_height_px_ensures_0_proved (result : Float) : vc_studio_timeline_height_px_ensures_0 result := trivial
def vc_studio_timeline_height_px_decreases_0 : Nat := 0
theorem vc_studio_timeline_height_px_decreases_0_proved : vc_studio_timeline_height_px_decreases_0 = 0 := rfl

end studio_timeline_height_px

namespace studio_agent_strip_height_px

def vc_studio_agent_strip_height_px_requires_0 : Prop := True
theorem vc_studio_agent_strip_height_px_requires_0_proved : vc_studio_agent_strip_height_px_requires_0 := trivial
def vc_studio_agent_strip_height_px_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_strip_height_px_ensures_0_proved (result : Float) : vc_studio_agent_strip_height_px_ensures_0 result := trivial
def vc_studio_agent_strip_height_px_decreases_0 : Nat := 0
theorem vc_studio_agent_strip_height_px_decreases_0_proved : vc_studio_agent_strip_height_px_decreases_0 = 0 := rfl

end studio_agent_strip_height_px

namespace studio_agent_stream_step_total

def vc_studio_agent_stream_step_total_requires_0 : Prop := True
theorem vc_studio_agent_stream_step_total_requires_0_proved : vc_studio_agent_stream_step_total_requires_0 := trivial
def vc_studio_agent_stream_step_total_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_stream_step_total_ensures_0_proved (result : Int) : vc_studio_agent_stream_step_total_ensures_0 result := trivial
def vc_studio_agent_stream_step_total_decreases_0 : Nat := 0
theorem vc_studio_agent_stream_step_total_decreases_0_proved : vc_studio_agent_stream_step_total_decreases_0 = 0 := rfl

end studio_agent_stream_step_total

namespace studio_agent_stream_tick_budget_ms

def vc_studio_agent_stream_tick_budget_ms_requires_0 : Prop := True
theorem vc_studio_agent_stream_tick_budget_ms_requires_0_proved : vc_studio_agent_stream_tick_budget_ms_requires_0 := trivial
def vc_studio_agent_stream_tick_budget_ms_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_stream_tick_budget_ms_ensures_0_proved (result : Float) : vc_studio_agent_stream_tick_budget_ms_ensures_0 result := trivial
def vc_studio_agent_stream_tick_budget_ms_decreases_0 : Nat := 0
theorem vc_studio_agent_stream_tick_budget_ms_decreases_0_proved : vc_studio_agent_stream_tick_budget_ms_decreases_0 = 0 := rfl

end studio_agent_stream_tick_budget_ms

namespace studio_agent_cancel_budget_ms

def vc_studio_agent_cancel_budget_ms_requires_0 : Prop := True
theorem vc_studio_agent_cancel_budget_ms_requires_0_proved : vc_studio_agent_cancel_budget_ms_requires_0 := trivial
def vc_studio_agent_cancel_budget_ms_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_cancel_budget_ms_ensures_0_proved (result : Float) : vc_studio_agent_cancel_budget_ms_ensures_0 result := trivial
def vc_studio_agent_cancel_budget_ms_decreases_0 : Nat := 0
theorem vc_studio_agent_cancel_budget_ms_decreases_0_proved : vc_studio_agent_cancel_budget_ms_decreases_0 = 0 := rfl

end studio_agent_cancel_budget_ms

namespace studio_agent_stream_new

def vc_studio_agent_stream_new_requires_0 : Prop := True
theorem vc_studio_agent_stream_new_requires_0_proved : vc_studio_agent_stream_new_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_stream_new_ensures_0 (result : Int) : Prop := True
theorem vc_studio_agent_stream_new_ensures_0_proved (result : Int) : vc_studio_agent_stream_new_ensures_0 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_stream_new_ensures_1 (result : Int) : Prop := True
theorem vc_studio_agent_stream_new_ensures_1_proved (result : Int) : vc_studio_agent_stream_new_ensures_1 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_stream_new_ensures_2 (result : Int) : Prop := True
theorem vc_studio_agent_stream_new_ensures_2_proved (result : Int) : vc_studio_agent_stream_new_ensures_2 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_stream_new_ensures_3 (result : Int) : Prop := True
theorem vc_studio_agent_stream_new_ensures_3_proved (result : Int) : vc_studio_agent_stream_new_ensures_3 result := trivial
def vc_studio_agent_stream_new_decreases_0 : Nat := 0
theorem vc_studio_agent_stream_new_decreases_0_proved : vc_studio_agent_stream_new_decreases_0 = 0 := rfl
def vc_studio_agent_stream_new_call0_studio_agent_task_idle_requires_0 : Prop := True
theorem vc_studio_agent_stream_new_call0_studio_agent_task_idle_requires_0_proved : vc_studio_agent_stream_new_call0_studio_agent_task_idle_requires_0 := trivial
def vc_studio_agent_stream_new_call1_studio_agent_stream_step_total_requires_0 : Prop := True
theorem vc_studio_agent_stream_new_call1_studio_agent_stream_step_total_requires_0_proved : vc_studio_agent_stream_new_call1_studio_agent_stream_step_total_requires_0 := trivial

end studio_agent_stream_new

namespace studio_agent_stream_start

/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_agent_stream_start_requires_0 (stream : Int) : Prop := True
theorem vc_studio_agent_stream_start_requires_0_proved (stream : Int) : vc_studio_agent_stream_start_requires_0 stream := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_stream_start_ensures_0 (stream : Int) (result : Unit) : Prop := True
theorem vc_studio_agent_stream_start_ensures_0_proved (stream : Int) (result : Unit) : vc_studio_agent_stream_start_ensures_0 stream result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_stream_start_ensures_1 (stream : Int) (result : Unit) : Prop := True
theorem vc_studio_agent_stream_start_ensures_1_proved (stream : Int) (result : Unit) : vc_studio_agent_stream_start_ensures_1 stream result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_stream_start_ensures_2 (stream : Int) (result : Unit) : Prop := True
theorem vc_studio_agent_stream_start_ensures_2_proved (stream : Int) (result : Unit) : vc_studio_agent_stream_start_ensures_2 stream result := trivial
def vc_studio_agent_stream_start_decreases_0 (stream : Int) : Nat := 0
theorem vc_studio_agent_stream_start_decreases_0_proved (stream : Int) : vc_studio_agent_stream_start_decreases_0 stream = 0 := rfl
def vc_studio_agent_stream_start_call0_studio_agent_task_running_requires_0 (stream : Int) : Prop := True
theorem vc_studio_agent_stream_start_call0_studio_agent_task_running_requires_0_proved (stream : Int) : vc_studio_agent_stream_start_call0_studio_agent_task_running_requires_0 stream := trivial

end studio_agent_stream_start

namespace studio_agent_step_as_float

def vc_studio_agent_step_as_float_requires_0 (step : Int) : Prop := (step ≥ 0)
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_agent_step_as_float_requires_1 (step : Int) : Prop := True
theorem vc_studio_agent_step_as_float_requires_1_proved (step : Int) : vc_studio_agent_step_as_float_requires_1 step := trivial
def vc_studio_agent_step_as_float_ensures_0 (step : Int) (result : Float) : Prop := (result ≥ (0 : Float))
def vc_studio_agent_step_as_float_decreases_0 (step : Int) : Nat := Int.toNat step
theorem vc_studio_agent_step_as_float_decreases_0_proved (step : Int) : vc_studio_agent_step_as_float_decreases_0 step = Int.toNat step := rfl

end studio_agent_step_as_float

namespace studio_agent_stream_progress_pct

def vc_studio_agent_stream_progress_pct_requires_0 (step_index : Int) (step_total : Int) : Prop := (step_index ≥ 0)
def vc_studio_agent_stream_progress_pct_requires_1 (step_index : Int) (step_total : Int) : Prop := (step_total > 0)
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_agent_stream_progress_pct_requires_2 (step_index : Int) (step_total : Int) : Prop := True
theorem vc_studio_agent_stream_progress_pct_requires_2_proved (step_index : Int) (step_total : Int) : vc_studio_agent_stream_progress_pct_requires_2 step_index step_total := trivial
def vc_studio_agent_stream_progress_pct_ensures_0 (step_index : Int) (step_total : Int) (result : Float) : Prop := (result ≥ (0 : Float))
def vc_studio_agent_stream_progress_pct_ensures_1 (step_index : Int) (step_total : Int) (result : Float) : Prop := (result ≤ (1 : Float))
def vc_studio_agent_stream_progress_pct_decreases_0 (step_index : Int) (step_total : Int) : Nat := Int.toNat step_index
theorem vc_studio_agent_stream_progress_pct_decreases_0_proved (step_index : Int) (step_total : Int) : vc_studio_agent_stream_progress_pct_decreases_0 step_index step_total = Int.toNat step_index := rfl
def vc_studio_agent_stream_progress_pct_call0_studio_agent_step_as_float_requires_0 (step_index : Int) (step_total : Int) : Prop := (step_index ≥ 0)
/-! VC call-site requires (opaque): callee 'studio_agent_step_as_float' at call 0 -/
def vc_studio_agent_stream_progress_pct_call0_studio_agent_step_as_float_requires_1 (step_index : Int) (step_total : Int) : Prop := True
def vc_studio_agent_stream_progress_pct_call1_studio_agent_step_as_float_requires_0 (step_index : Int) (step_total : Int) : Prop := (step_total ≥ 0)
/-! VC call-site requires (opaque): callee 'studio_agent_step_as_float' at call 1 -/
def vc_studio_agent_stream_progress_pct_call1_studio_agent_step_as_float_requires_1 (step_index : Int) (step_total : Int) : Prop := True

end studio_agent_stream_progress_pct

namespace studio_agent_stream_tick

def vc_studio_agent_stream_tick_requires_0 (stream : Int) (elapsed_ms : Float) : Prop := (elapsed_ms ≥ (0 : Float))
/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_agent_stream_tick_requires_1 (stream : Int) (elapsed_ms : Float) : Prop := True
theorem vc_studio_agent_stream_tick_requires_1_proved (stream : Int) (elapsed_ms : Float) : vc_studio_agent_stream_tick_requires_1 stream elapsed_ms := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_stream_tick_ensures_0 (stream : Int) (elapsed_ms : Float) (result : Unit) : Prop := True
theorem vc_studio_agent_stream_tick_ensures_0_proved (stream : Int) (elapsed_ms : Float) (result : Unit) : vc_studio_agent_stream_tick_ensures_0 stream elapsed_ms result := trivial
def vc_studio_agent_stream_tick_decreases_0 (stream : Int) (elapsed_ms : Float) : Nat := 0
theorem vc_studio_agent_stream_tick_decreases_0_proved (stream : Int) (elapsed_ms : Float) : vc_studio_agent_stream_tick_decreases_0 stream elapsed_ms = 0 := rfl
def vc_studio_agent_stream_tick_call0_studio_agent_task_idle_requires_0 (stream : Int) (elapsed_ms : Float) : Prop := True
theorem vc_studio_agent_stream_tick_call0_studio_agent_task_idle_requires_0_proved (stream : Int) (elapsed_ms : Float) : vc_studio_agent_stream_tick_call0_studio_agent_task_idle_requires_0 stream elapsed_ms := trivial
def vc_studio_agent_stream_tick_call1_studio_agent_task_running_requires_0 (stream : Int) (elapsed_ms : Float) : Prop := True
theorem vc_studio_agent_stream_tick_call1_studio_agent_task_running_requires_0_proved (stream : Int) (elapsed_ms : Float) : vc_studio_agent_stream_tick_call1_studio_agent_task_running_requires_0 stream elapsed_ms := trivial
/-! VC call-site requires (opaque): callee 'studio_agent_stream_progress_pct' at call 2 -/
def vc_studio_agent_stream_tick_call2_studio_agent_stream_progress_pct_requires_0 (stream : Int) (elapsed_ms : Float) : Prop := True
/-! VC call-site requires (opaque): callee 'studio_agent_stream_progress_pct' at call 2 -/
def vc_studio_agent_stream_tick_call2_studio_agent_stream_progress_pct_requires_1 (stream : Int) (elapsed_ms : Float) : Prop := True
/-! VC call-site requires (opaque): callee 'studio_agent_stream_progress_pct' at call 2 -/
def vc_studio_agent_stream_tick_call2_studio_agent_stream_progress_pct_requires_2 (stream : Int) (elapsed_ms : Float) : Prop := True
def vc_studio_agent_stream_tick_call3_studio_agent_task_done_requires_0 (stream : Int) (elapsed_ms : Float) : Prop := True
theorem vc_studio_agent_stream_tick_call3_studio_agent_task_done_requires_0_proved (stream : Int) (elapsed_ms : Float) : vc_studio_agent_stream_tick_call3_studio_agent_task_done_requires_0 stream elapsed_ms := trivial

end studio_agent_stream_tick

namespace studio_agent_stream_cancel

/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_agent_stream_cancel_requires_0 (stream : Int) : Prop := True
theorem vc_studio_agent_stream_cancel_requires_0_proved (stream : Int) : vc_studio_agent_stream_cancel_requires_0 stream := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_stream_cancel_ensures_0 (stream : Int) (result : Unit) : Prop := True
theorem vc_studio_agent_stream_cancel_ensures_0_proved (stream : Int) (result : Unit) : vc_studio_agent_stream_cancel_ensures_0 stream result := trivial
def vc_studio_agent_stream_cancel_decreases_0 (stream : Int) : Nat := 0
theorem vc_studio_agent_stream_cancel_decreases_0_proved (stream : Int) : vc_studio_agent_stream_cancel_decreases_0 stream = 0 := rfl
def vc_studio_agent_stream_cancel_call0_studio_agent_task_running_requires_0 (stream : Int) : Prop := True
theorem vc_studio_agent_stream_cancel_call0_studio_agent_task_running_requires_0_proved (stream : Int) : vc_studio_agent_stream_cancel_call0_studio_agent_task_running_requires_0 stream := trivial
def vc_studio_agent_stream_cancel_call1_studio_agent_task_idle_requires_0 (stream : Int) : Prop := True
theorem vc_studio_agent_stream_cancel_call1_studio_agent_task_idle_requires_0_proved (stream : Int) : vc_studio_agent_stream_cancel_call1_studio_agent_task_idle_requires_0 stream := trivial
def vc_studio_agent_stream_cancel_call2_studio_agent_task_blocked_requires_0 (stream : Int) : Prop := True
theorem vc_studio_agent_stream_cancel_call2_studio_agent_task_blocked_requires_0_proved (stream : Int) : vc_studio_agent_stream_cancel_call2_studio_agent_task_blocked_requires_0 stream := trivial
def vc_studio_agent_stream_cancel_call3_studio_agent_task_idle_requires_0 (stream : Int) : Prop := True
theorem vc_studio_agent_stream_cancel_call3_studio_agent_task_idle_requires_0_proved (stream : Int) : vc_studio_agent_stream_cancel_call3_studio_agent_task_idle_requires_0 stream := trivial

end studio_agent_stream_cancel

namespace studio_agent_stream_ok

/-! VC requires (opaque): source expr not yet translated -/
def vc_studio_agent_stream_ok_requires_0 (stream : Int) : Prop := True
theorem vc_studio_agent_stream_ok_requires_0_proved (stream : Int) : vc_studio_agent_stream_ok_requires_0 stream := trivial
def vc_studio_agent_stream_ok_ensures_0 (stream : Int) (result : Int) : Prop := (result ≥ 0)
def vc_studio_agent_stream_ok_ensures_1 (stream : Int) (result : Int) : Prop := (result ≤ 1)
def vc_studio_agent_stream_ok_decreases_0 (stream : Int) : Nat := 0
theorem vc_studio_agent_stream_ok_decreases_0_proved (stream : Int) : vc_studio_agent_stream_ok_decreases_0 stream = 0 := rfl
def vc_studio_agent_stream_ok_call0_studio_agent_task_idle_requires_0 (stream : Int) : Prop := True
theorem vc_studio_agent_stream_ok_call0_studio_agent_task_idle_requires_0_proved (stream : Int) : vc_studio_agent_stream_ok_call0_studio_agent_task_idle_requires_0 stream := trivial
def vc_studio_agent_stream_ok_call1_studio_agent_task_done_requires_0 (stream : Int) : Prop := True
theorem vc_studio_agent_stream_ok_call1_studio_agent_task_done_requires_0_proved (stream : Int) : vc_studio_agent_stream_ok_call1_studio_agent_task_done_requires_0 stream := trivial

end studio_agent_stream_ok

namespace studio_agent_tick_latency_native_ms

def vc_studio_agent_tick_latency_native_ms_requires_0 : Prop := True
theorem vc_studio_agent_tick_latency_native_ms_requires_0_proved : vc_studio_agent_tick_latency_native_ms_requires_0 := trivial
def vc_studio_agent_tick_latency_native_ms_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_tick_latency_native_ms_ensures_0_proved (result : Float) : vc_studio_agent_tick_latency_native_ms_ensures_0 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_tick_latency_native_ms_ensures_1 (result : Float) : Prop := True
theorem vc_studio_agent_tick_latency_native_ms_ensures_1_proved (result : Float) : vc_studio_agent_tick_latency_native_ms_ensures_1 result := trivial
def vc_studio_agent_tick_latency_native_ms_decreases_0 : Nat := 0
theorem vc_studio_agent_tick_latency_native_ms_decreases_0_proved : vc_studio_agent_tick_latency_native_ms_decreases_0 = 0 := rfl

end studio_agent_tick_latency_native_ms

namespace studio_agent_cancel_latency_native_ms

def vc_studio_agent_cancel_latency_native_ms_requires_0 : Prop := True
theorem vc_studio_agent_cancel_latency_native_ms_requires_0_proved : vc_studio_agent_cancel_latency_native_ms_requires_0 := trivial
def vc_studio_agent_cancel_latency_native_ms_ensures_0 (result : Float) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_studio_agent_cancel_latency_native_ms_ensures_0_proved (result : Float) : vc_studio_agent_cancel_latency_native_ms_ensures_0 result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_cancel_latency_native_ms_ensures_1 (result : Float) : Prop := True
theorem vc_studio_agent_cancel_latency_native_ms_ensures_1_proved (result : Float) : vc_studio_agent_cancel_latency_native_ms_ensures_1 result := trivial
def vc_studio_agent_cancel_latency_native_ms_decreases_0 : Nat := 0
theorem vc_studio_agent_cancel_latency_native_ms_decreases_0_proved : vc_studio_agent_cancel_latency_native_ms_decreases_0 = 0 := rfl

end studio_agent_cancel_latency_native_ms

namespace studio_agent_bench_native

def vc_studio_agent_bench_native_requires_0 (w : Float) (h : Float) : Prop := (w > (0 : Float))
def vc_studio_agent_bench_native_requires_1 (w : Float) (h : Float) : Prop := (h > (0 : Float))
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_bench_native_ensures_0 (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_studio_agent_bench_native_ensures_0_proved (w : Float) (h : Float) (result : Int) : vc_studio_agent_bench_native_ensures_0 w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_bench_native_ensures_1 (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_studio_agent_bench_native_ensures_1_proved (w : Float) (h : Float) (result : Int) : vc_studio_agent_bench_native_ensures_1 w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_bench_native_ensures_2 (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_studio_agent_bench_native_ensures_2_proved (w : Float) (h : Float) (result : Int) : vc_studio_agent_bench_native_ensures_2 w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_studio_agent_bench_native_ensures_3 (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_studio_agent_bench_native_ensures_3_proved (w : Float) (h : Float) (result : Int) : vc_studio_agent_bench_native_ensures_3 w h result := trivial
def vc_studio_agent_bench_native_decreases_0 (w : Float) (h : Float) : Nat := 0
theorem vc_studio_agent_bench_native_decreases_0_proved (w : Float) (h : Float) : vc_studio_agent_bench_native_decreases_0 w h = 0 := rfl
def vc_studio_agent_bench_native_call0_studio_agent_stream_new_requires_0 (w : Float) (h : Float) : Prop := True
theorem vc_studio_agent_bench_native_call0_studio_agent_stream_new_requires_0_proved (w : Float) (h : Float) : vc_studio_agent_bench_native_call0_studio_agent_stream_new_requires_0 w h := trivial
/-! VC call-site requires (opaque): callee 'studio_agent_stream_start' at call 1 -/
def vc_studio_agent_bench_native_call1_studio_agent_stream_start_requires_0 (w : Float) (h : Float) (stream : Int) : Prop := True
def vc_studio_agent_bench_native_call2_studio_agent_tick_latency_native_ms_requires_0 (w : Float) (h : Float) : Prop := True
theorem vc_studio_agent_bench_native_call2_studio_agent_tick_latency_native_ms_requires_0_proved (w : Float) (h : Float) : vc_studio_agent_bench_native_call2_studio_agent_tick_latency_native_ms_requires_0 w h := trivial
def vc_studio_agent_bench_native_call3_studio_agent_stream_tick_requires_0 (w : Float) (h : Float) (tick_ms : Float) : Prop := (tick_ms ≥ (0 : Float))
/-! VC call-site requires (opaque): callee 'studio_agent_stream_tick' at call 3 -/
def vc_studio_agent_bench_native_call3_studio_agent_stream_tick_requires_1 (w : Float) (h : Float) (stream : Int) : Prop := True
def vc_studio_agent_bench_native_call4_studio_agent_stream_tick_requires_0 (w : Float) (h : Float) (tick_ms : Float) : Prop := (tick_ms ≥ (0 : Float))
/-! VC call-site requires (opaque): callee 'studio_agent_stream_tick' at call 4 -/
def vc_studio_agent_bench_native_call4_studio_agent_stream_tick_requires_1 (w : Float) (h : Float) (stream : Int) : Prop := True
def vc_studio_agent_bench_native_call5_studio_agent_stream_tick_requires_0 (w : Float) (h : Float) (tick_ms : Float) : Prop := (tick_ms ≥ (0 : Float))
/-! VC call-site requires (opaque): callee 'studio_agent_stream_tick' at call 5 -/
def vc_studio_agent_bench_native_call5_studio_agent_stream_tick_requires_1 (w : Float) (h : Float) (stream : Int) : Prop := True
def vc_studio_agent_bench_native_call6_studio_agent_stream_new_requires_0 (w : Float) (h : Float) : Prop := True
theorem vc_studio_agent_bench_native_call6_studio_agent_stream_new_requires_0_proved (w : Float) (h : Float) : vc_studio_agent_bench_native_call6_studio_agent_stream_new_requires_0 w h := trivial
/-! VC call-site requires (opaque): callee 'studio_agent_stream_start' at call 7 -/
def vc_studio_agent_bench_native_call7_studio_agent_stream_start_requires_0 (w : Float) (h : Float) (cancel_stream : Int) : Prop := True
def vc_studio_agent_bench_native_call8_studio_agent_cancel_latency_native_ms_requires_0 (w : Float) (h : Float) : Prop := True
theorem vc_studio_agent_bench_native_call8_studio_agent_cancel_latency_native_ms_requires_0_proved (w : Float) (h : Float) : vc_studio_agent_bench_native_call8_studio_agent_cancel_latency_native_ms_requires_0 w h := trivial
/-! VC call-site requires (opaque): callee 'studio_agent_stream_cancel' at call 9 -/
def vc_studio_agent_bench_native_call9_studio_agent_stream_cancel_requires_0 (w : Float) (h : Float) (cancel_stream : Int) : Prop := True
def vc_studio_agent_bench_native_call10_studio_agent_task_idle_requires_0 (w : Float) (h : Float) : Prop := True
theorem vc_studio_agent_bench_native_call10_studio_agent_task_idle_requires_0_proved (w : Float) (h : Float) : vc_studio_agent_bench_native_call10_studio_agent_task_idle_requires_0 w h := trivial

end studio_agent_bench_native

namespace rect_make

def vc_rect_make_requires_0 (x : Float) (y : Float) (w : Float) (h : Float) : Prop := (w ≥ (0 : Float))
def vc_rect_make_requires_1 (x : Float) (y : Float) (w : Float) (h : Float) : Prop := (h ≥ (0 : Float))
/-! VC ensures (opaque): source expr not yet translated -/
def vc_rect_make_ensures_0 (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_rect_make_ensures_0_proved (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : vc_rect_make_ensures_0 x y w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_rect_make_ensures_1 (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_rect_make_ensures_1_proved (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : vc_rect_make_ensures_1 x y w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_rect_make_ensures_2 (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_rect_make_ensures_2_proved (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : vc_rect_make_ensures_2 x y w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_rect_make_ensures_3 (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_rect_make_ensures_3_proved (x : Float) (y : Float) (w : Float) (h : Float) (result : Int) : vc_rect_make_ensures_3 x y w h result := trivial
def vc_rect_make_decreases_0 (x : Float) (y : Float) (w : Float) (h : Float) : Nat := 0
theorem vc_rect_make_decreases_0_proved (x : Float) (y : Float) (w : Float) (h : Float) : vc_rect_make_decreases_0 x y w h = 0 := rfl

end rect_make

namespace layout_studio_shell_adaptive_inspector

def vc_layout_studio_shell_adaptive_inspector_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := (w > (0 : Float))
def vc_layout_studio_shell_adaptive_inspector_requires_1 (w : Float) (h : Float) (inspector_w : Float) : Prop := (h > (0 : Float))
def vc_layout_studio_shell_adaptive_inspector_requires_2 (w : Float) (h : Float) (inspector_w : Float) : Prop := (inspector_w ≥ (200 : Float))
def vc_layout_studio_shell_adaptive_inspector_requires_3 (w : Float) (h : Float) (inspector_w : Float) : Prop := (inspector_w ≤ w)
/-! VC ensures (opaque): source expr not yet translated -/
def vc_layout_studio_shell_adaptive_inspector_ensures_0 (w : Float) (h : Float) (inspector_w : Float) (result : Int) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_ensures_0_proved (w : Float) (h : Float) (inspector_w : Float) (result : Int) : vc_layout_studio_shell_adaptive_inspector_ensures_0 w h inspector_w result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_layout_studio_shell_adaptive_inspector_ensures_1 (w : Float) (h : Float) (inspector_w : Float) (result : Int) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_ensures_1_proved (w : Float) (h : Float) (inspector_w : Float) (result : Int) : vc_layout_studio_shell_adaptive_inspector_ensures_1 w h inspector_w result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_layout_studio_shell_adaptive_inspector_ensures_2 (w : Float) (h : Float) (inspector_w : Float) (result : Int) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_ensures_2_proved (w : Float) (h : Float) (inspector_w : Float) (result : Int) : vc_layout_studio_shell_adaptive_inspector_ensures_2 w h inspector_w result := trivial
def vc_layout_studio_shell_adaptive_inspector_decreases_0 (w : Float) (h : Float) (inspector_w : Float) : Nat := 0
theorem vc_layout_studio_shell_adaptive_inspector_decreases_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_decreases_0 w h inspector_w = 0 := rfl
/-! VC call-site requires (opaque): callee 'rect_make' at call 0 -/
def vc_layout_studio_shell_adaptive_inspector_call0_rect_make_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
def vc_layout_studio_shell_adaptive_inspector_call0_rect_make_requires_1 (w : Float) (h : Float) (inspector_w : Float) (h1 : Float) : Prop := (h1 ≥ (0 : Float))
def vc_layout_studio_shell_adaptive_inspector_call1_studio_dock_width_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call1_studio_dock_width_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call1_studio_dock_width_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call2_studio_dock_width_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call2_studio_dock_width_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call2_studio_dock_width_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call3_rect_make_requires_0 (w : Float) (h : Float) (inspector_w : Float) (top_w : Float) : Prop := (top_w ≥ (0 : Float))
/-! VC call-site requires (opaque): callee 'rect_make' at call 3 -/
def vc_layout_studio_shell_adaptive_inspector_call3_rect_make_requires_1 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
def vc_layout_studio_shell_adaptive_inspector_call4_studio_dock_width_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call4_studio_dock_width_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call4_studio_dock_width_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call5_studio_topbar_height_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call5_studio_topbar_height_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call5_studio_topbar_height_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call6_studio_dock_width_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call6_studio_dock_width_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call6_studio_dock_width_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call7_studio_topbar_height_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call7_studio_topbar_height_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call7_studio_topbar_height_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call8_studio_timeline_height_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call8_studio_timeline_height_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call8_studio_timeline_height_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call9_studio_agent_strip_height_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call9_studio_agent_strip_height_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call9_studio_agent_strip_height_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call10_studio_topbar_height_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call10_studio_topbar_height_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call10_studio_topbar_height_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call11_rect_make_requires_0 (w : Float) (h : Float) (inspector_w : Float) (vp_w : Float) : Prop := (vp_w ≥ (0 : Float))
def vc_layout_studio_shell_adaptive_inspector_call11_rect_make_requires_1 (w : Float) (h : Float) (inspector_w : Float) (vp_h : Float) : Prop := (vp_h ≥ (0 : Float))
def vc_layout_studio_shell_adaptive_inspector_call12_studio_dock_width_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call12_studio_dock_width_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call12_studio_dock_width_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call13_studio_topbar_height_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call13_studio_topbar_height_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call13_studio_topbar_height_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call14_rect_make_requires_0 (w : Float) (h : Float) (inspector_w : Float) (insp_w : Float) : Prop := (insp_w ≥ (0 : Float))
/-! VC call-site requires (opaque): callee 'rect_make' at call 14 -/
def vc_layout_studio_shell_adaptive_inspector_call14_rect_make_requires_1 (w : Float) (h : Float) (inspector_w : Float) (h3 : Float) : Prop := True
def vc_layout_studio_shell_adaptive_inspector_call15_studio_topbar_height_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call15_studio_topbar_height_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call15_studio_topbar_height_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call16_studio_topbar_height_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call16_studio_topbar_height_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call16_studio_topbar_height_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call17_studio_dock_width_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call17_studio_dock_width_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call17_studio_dock_width_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call18_rect_make_requires_0 (w : Float) (h : Float) (inspector_w : Float) (tl_w : Float) : Prop := (tl_w ≥ (0 : Float))
/-! VC call-site requires (opaque): callee 'rect_make' at call 18 -/
def vc_layout_studio_shell_adaptive_inspector_call18_rect_make_requires_1 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
def vc_layout_studio_shell_adaptive_inspector_call19_studio_dock_width_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call19_studio_dock_width_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call19_studio_dock_width_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call20_studio_timeline_height_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call20_studio_timeline_height_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call20_studio_timeline_height_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call21_studio_timeline_height_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call21_studio_timeline_height_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call21_studio_timeline_height_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call22_studio_dock_width_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call22_studio_dock_width_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call22_studio_dock_width_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call23_rect_make_requires_0 (w : Float) (h : Float) (inspector_w : Float) (agent_w : Float) : Prop := (agent_w ≥ (0 : Float))
/-! VC call-site requires (opaque): callee 'rect_make' at call 23 -/
def vc_layout_studio_shell_adaptive_inspector_call23_rect_make_requires_1 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
def vc_layout_studio_shell_adaptive_inspector_call24_studio_dock_width_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call24_studio_dock_width_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call24_studio_dock_width_px_requires_0 w h inspector_w := trivial
def vc_layout_studio_shell_adaptive_inspector_call25_studio_agent_strip_height_px_requires_0 (w : Float) (h : Float) (inspector_w : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_inspector_call25_studio_agent_strip_height_px_requires_0_proved (w : Float) (h : Float) (inspector_w : Float) : vc_layout_studio_shell_adaptive_inspector_call25_studio_agent_strip_height_px_requires_0 w h inspector_w := trivial

end layout_studio_shell_adaptive_inspector

namespace studio_inspector_width_for_drug_litl_stage

def vc_studio_inspector_width_for_drug_litl_stage_requires_0 (litl_stage : Int) : Prop := (litl_stage ≥ 0)
def vc_studio_inspector_width_for_drug_litl_stage_requires_1 (litl_stage : Int) : Prop := (litl_stage ≤ 4)
def vc_studio_inspector_width_for_drug_litl_stage_ensures_0 (litl_stage : Int) (result : Float) : Prop := (result ≥ (260 : Float))
def vc_studio_inspector_width_for_drug_litl_stage_ensures_1 (litl_stage : Int) (result : Float) : Prop := (result ≤ (400 : Float))
def vc_studio_inspector_width_for_drug_litl_stage_decreases_0 (litl_stage : Int) : Nat := Int.toNat litl_stage
theorem vc_studio_inspector_width_for_drug_litl_stage_decreases_0_proved (litl_stage : Int) : vc_studio_inspector_width_for_drug_litl_stage_decreases_0 litl_stage = Int.toNat litl_stage := rfl

end studio_inspector_width_for_drug_litl_stage

namespace layout_studio_shell_drug_litl

def vc_layout_studio_shell_drug_litl_requires_0 (w : Float) (h : Float) (litl_stage : Int) : Prop := (w > (0 : Float))
def vc_layout_studio_shell_drug_litl_requires_1 (w : Float) (h : Float) (litl_stage : Int) : Prop := (h > (0 : Float))
def vc_layout_studio_shell_drug_litl_requires_2 (w : Float) (h : Float) (litl_stage : Int) : Prop := (litl_stage ≥ 0)
def vc_layout_studio_shell_drug_litl_requires_3 (w : Float) (h : Float) (litl_stage : Int) : Prop := (litl_stage ≤ 4)
/-! VC ensures (opaque): source expr not yet translated -/
def vc_layout_studio_shell_drug_litl_ensures_0 (w : Float) (h : Float) (litl_stage : Int) (result : Int) : Prop := True
theorem vc_layout_studio_shell_drug_litl_ensures_0_proved (w : Float) (h : Float) (litl_stage : Int) (result : Int) : vc_layout_studio_shell_drug_litl_ensures_0 w h litl_stage result := trivial
def vc_layout_studio_shell_drug_litl_decreases_0 (w : Float) (h : Float) (litl_stage : Int) : Nat := Int.toNat litl_stage
theorem vc_layout_studio_shell_drug_litl_decreases_0_proved (w : Float) (h : Float) (litl_stage : Int) : vc_layout_studio_shell_drug_litl_decreases_0 w h litl_stage = Int.toNat litl_stage := rfl
def vc_layout_studio_shell_drug_litl_call0_studio_inspector_width_for_drug_litl_stage_requires_0 (w : Float) (h : Float) (litl_stage : Int) : Prop := (litl_stage ≥ 0)
def vc_layout_studio_shell_drug_litl_call0_studio_inspector_width_for_drug_litl_stage_requires_1 (w : Float) (h : Float) (litl_stage : Int) : Prop := (litl_stage ≤ 4)
def vc_layout_studio_shell_drug_litl_call1_layout_studio_shell_adaptive_inspector_requires_0 (w : Float) (h : Float) (litl_stage : Int) : Prop := (w > (0 : Float))
def vc_layout_studio_shell_drug_litl_call1_layout_studio_shell_adaptive_inspector_requires_1 (w : Float) (h : Float) (litl_stage : Int) : Prop := (h > (0 : Float))
def vc_layout_studio_shell_drug_litl_call1_layout_studio_shell_adaptive_inspector_requires_2 (w : Float) (h : Float) (litl_stage : Int) (insp_w : Float) : Prop := (insp_w ≥ (200 : Float))
def vc_layout_studio_shell_drug_litl_call1_layout_studio_shell_adaptive_inspector_requires_3 (w : Float) (h : Float) (litl_stage : Int) (insp_w : Float) : Prop := (insp_w ≤ w)

end layout_studio_shell_drug_litl

namespace layout_studio_shell_adaptive

def vc_layout_studio_shell_adaptive_requires_0 (w : Float) (h : Float) : Prop := (w > (0 : Float))
def vc_layout_studio_shell_adaptive_requires_1 (w : Float) (h : Float) : Prop := (h > (0 : Float))
/-! VC ensures (opaque): source expr not yet translated -/
def vc_layout_studio_shell_adaptive_ensures_0 (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_layout_studio_shell_adaptive_ensures_0_proved (w : Float) (h : Float) (result : Int) : vc_layout_studio_shell_adaptive_ensures_0 w h result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_layout_studio_shell_adaptive_ensures_1 (w : Float) (h : Float) (result : Int) : Prop := True
theorem vc_layout_studio_shell_adaptive_ensures_1_proved (w : Float) (h : Float) (result : Int) : vc_layout_studio_shell_adaptive_ensures_1 w h result := trivial
def vc_layout_studio_shell_adaptive_decreases_0 (w : Float) (h : Float) : Nat := 0
theorem vc_layout_studio_shell_adaptive_decreases_0_proved (w : Float) (h : Float) : vc_layout_studio_shell_adaptive_decreases_0 w h = 0 := rfl
def vc_layout_studio_shell_adaptive_call0_layout_studio_shell_adaptive_inspector_requires_0 (w : Float) (h : Float) : Prop := (w > (0 : Float))
def vc_layout_studio_shell_adaptive_call0_layout_studio_shell_adaptive_inspector_requires_1 (w : Float) (h : Float) : Prop := (h > (0 : Float))
/-! VC call-site requires (opaque): callee 'layout_studio_shell_adaptive_inspector' at call 0 -/
def vc_layout_studio_shell_adaptive_call0_layout_studio_shell_adaptive_inspector_requires_2 (w : Float) (h : Float) : Prop := True
/-! VC call-site requires (opaque): callee 'layout_studio_shell_adaptive_inspector' at call 0 -/
def vc_layout_studio_shell_adaptive_call0_layout_studio_shell_adaptive_inspector_requires_3 (w : Float) (h : Float) : Prop := True
def vc_layout_studio_shell_adaptive_call1_studio_inspector_width_px_requires_0 (w : Float) (h : Float) : Prop := True
theorem vc_layout_studio_shell_adaptive_call1_studio_inspector_width_px_requires_0_proved (w : Float) (h : Float) : vc_layout_studio_shell_adaptive_call1_studio_inspector_width_px_requires_0 w h := trivial

end layout_studio_shell_adaptive

namespace layout_region_rect

def vc_layout_region_rect_requires_0 (layout : Int) (region : Int) : Prop := (region ≥ 1)
def vc_layout_region_rect_requires_1 (layout : Int) (region : Int) : Prop := (region ≤ 6)
/-! VC ensures (opaque): source expr not yet translated -/
def vc_layout_region_rect_ensures_0 (layout : Int) (region : Int) (result : Int) : Prop := True
theorem vc_layout_region_rect_ensures_0_proved (layout : Int) (region : Int) (result : Int) : vc_layout_region_rect_ensures_0 layout region result := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_layout_region_rect_ensures_1 (layout : Int) (region : Int) (result : Int) : Prop := True
theorem vc_layout_region_rect_ensures_1_proved (layout : Int) (region : Int) (result : Int) : vc_layout_region_rect_ensures_1 layout region result := trivial
def vc_layout_region_rect_decreases_0 (layout : Int) (region : Int) : Nat := Int.toNat region
theorem vc_layout_region_rect_decreases_0_proved (layout : Int) (region : Int) : vc_layout_region_rect_decreases_0 layout region = Int.toNat region := rfl
def vc_layout_region_rect_call0_studio_region_dock_requires_0 (layout : Int) (region : Int) : Prop := True
theorem vc_layout_region_rect_call0_studio_region_dock_requires_0_proved (layout : Int) (region : Int) : vc_layout_region_rect_call0_studio_region_dock_requires_0 layout region := trivial
def vc_layout_region_rect_call1_studio_region_topbar_requires_0 (layout : Int) (region : Int) : Prop := True
theorem vc_layout_region_rect_call1_studio_region_topbar_requires_0_proved (layout : Int) (region : Int) : vc_layout_region_rect_call1_studio_region_topbar_requires_0 layout region := trivial
def vc_layout_region_rect_call2_studio_region_viewport_requires_0 (layout : Int) (region : Int) : Prop := True
theorem vc_layout_region_rect_call2_studio_region_viewport_requires_0_proved (layout : Int) (region : Int) : vc_layout_region_rect_call2_studio_region_viewport_requires_0 layout region := trivial
def vc_layout_region_rect_call3_studio_region_inspector_requires_0 (layout : Int) (region : Int) : Prop := True
theorem vc_layout_region_rect_call3_studio_region_inspector_requires_0_proved (layout : Int) (region : Int) : vc_layout_region_rect_call3_studio_region_inspector_requires_0 layout region := trivial
def vc_layout_region_rect_call4_studio_region_timeline_requires_0 (layout : Int) (region : Int) : Prop := True
theorem vc_layout_region_rect_call4_studio_region_timeline_requires_0_proved (layout : Int) (region : Int) : vc_layout_region_rect_call4_studio_region_timeline_requires_0 layout region := trivial

end layout_region_rect

namespace layout_panel_switch_within_budget_ms

def vc_layout_panel_switch_within_budget_ms_requires_0 : Prop := True
theorem vc_layout_panel_switch_within_budget_ms_requires_0_proved : vc_layout_panel_switch_within_budget_ms_requires_0 := trivial
def vc_layout_panel_switch_within_budget_ms_ensures_0 (result : Int) : Prop := (result ≥ 0)
def vc_layout_panel_switch_within_budget_ms_ensures_1 (result : Int) : Prop := (result ≤ 1)
def vc_layout_panel_switch_within_budget_ms_decreases_0 : Nat := 0
theorem vc_layout_panel_switch_within_budget_ms_decreases_0_proved : vc_layout_panel_switch_within_budget_ms_decreases_0 = 0 := rfl
def vc_layout_panel_switch_within_budget_ms_call0_studio_panel_transition_ms_requires_0 : Prop := True
theorem vc_layout_panel_switch_within_budget_ms_call0_studio_panel_transition_ms_requires_0_proved : vc_layout_panel_switch_within_budget_ms_call0_studio_panel_transition_ms_requires_0 := trivial

end layout_panel_switch_within_budget_ms

namespace paint_op_fill_rect

def vc_paint_op_fill_rect_requires_0 : Prop := True
theorem vc_paint_op_fill_rect_requires_0_proved : vc_paint_op_fill_rect_requires_0 := trivial
def vc_paint_op_fill_rect_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_paint_op_fill_rect_ensures_0_proved (result : Int) : vc_paint_op_fill_rect_ensures_0 result := trivial
def vc_paint_op_fill_rect_decreases_0 : Nat := 0
theorem vc_paint_op_fill_rect_decreases_0_proved : vc_paint_op_fill_rect_decreases_0 = 0 := rfl

end paint_op_fill_rect

namespace paint_op_stroke_rect

def vc_paint_op_stroke_rect_requires_0 : Prop := True
theorem vc_paint_op_stroke_rect_requires_0_proved : vc_paint_op_stroke_rect_requires_0 := trivial
def vc_paint_op_stroke_rect_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_paint_op_stroke_rect_ensures_0_proved (result : Int) : vc_paint_op_stroke_rect_ensures_0 result := trivial
def vc_paint_op_stroke_rect_decreases_0 : Nat := 0
theorem vc_paint_op_stroke_rect_decreases_0_proved : vc_paint_op_stroke_rect_decreases_0 = 0 := rfl

end paint_op_stroke_rect

namespace paint_op_viewport_grid

def vc_paint_op_viewport_grid_requires_0 : Prop := True
theorem vc_paint_op_viewport_grid_requires_0_proved : vc_paint_op_viewport_grid_requires_0 := trivial
def vc_paint_op_viewport_grid_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_paint_op_viewport_grid_ensures_0_proved (result : Int) : vc_paint_op_viewport_grid_ensures_0 result := trivial
def vc_paint_op_viewport_grid_decreases_0 : Nat := 0
theorem vc_paint_op_viewport_grid_decreases_0_proved : vc_paint_op_viewport_grid_decreases_0 = 0 := rfl

end paint_op_viewport_grid

namespace paint_frame_new

def vc_paint_frame_new_requires_0 : Prop := True
theorem vc_paint_frame_new_requires_0_proved : vc_paint_frame_new_requires_0 := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_paint_frame_new_ensures_0 (result : Int) : Prop := True
theorem vc_paint_frame_new_ensures_0_proved (result : Int) : vc_paint_frame_new_ensures_0 result := trivial
def vc_paint_frame_new_decreases_0 : Nat := 0
theorem vc_paint_frame_new_decreases_0_proved : vc_paint_frame_new_decreases_0 = 0 := rfl
def vc_paint_frame_new_call0_rect_make_requires_0 : Prop := ((0 : Float) ≥ (0 : Float))
def vc_paint_frame_new_call0_rect_make_requires_1 : Prop := ((0 : Float) ≥ (0 : Float))
def vc_paint_frame_new_call1_studio_color_bg_primary_requires_0 : Prop := True
theorem vc_paint_frame_new_call1_studio_color_bg_primary_requires_0_proved : vc_paint_frame_new_call1_studio_color_bg_primary_requires_0 := trivial

end paint_frame_new

namespace paint_frame_push

/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_frame_push_requires_0 (frame : Int) (cmd : Int) : Prop := True
theorem vc_paint_frame_push_requires_0_proved (frame : Int) (cmd : Int) : vc_paint_frame_push_requires_0 frame cmd := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_frame_push_requires_1 (frame : Int) (cmd : Int) : Prop := True
theorem vc_paint_frame_push_requires_1_proved (frame : Int) (cmd : Int) : vc_paint_frame_push_requires_1 frame cmd := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_frame_push_requires_2 (frame : Int) (cmd : Int) : Prop := True
theorem vc_paint_frame_push_requires_2_proved (frame : Int) (cmd : Int) : vc_paint_frame_push_requires_2 frame cmd := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_paint_frame_push_ensures_0 (frame : Int) (cmd : Int) (result : Unit) : Prop := True
theorem vc_paint_frame_push_ensures_0_proved (frame : Int) (cmd : Int) (result : Unit) : vc_paint_frame_push_ensures_0 frame cmd result := trivial
def vc_paint_frame_push_decreases_0 (frame : Int) (cmd : Int) : Nat := 0
theorem vc_paint_frame_push_decreases_0_proved (frame : Int) (cmd : Int) : vc_paint_frame_push_decreases_0 frame cmd = 0 := rfl

end paint_frame_push

namespace paint_cmd_fill

/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_cmd_fill_requires_0 (rect : Int) (color : Int) : Prop := True
theorem vc_paint_cmd_fill_requires_0_proved (rect : Int) (color : Int) : vc_paint_cmd_fill_requires_0 rect color := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_cmd_fill_requires_1 (rect : Int) (color : Int) : Prop := True
theorem vc_paint_cmd_fill_requires_1_proved (rect : Int) (color : Int) : vc_paint_cmd_fill_requires_1 rect color := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_paint_cmd_fill_ensures_0 (rect : Int) (color : Int) (result : Int) : Prop := True
theorem vc_paint_cmd_fill_ensures_0_proved (rect : Int) (color : Int) (result : Int) : vc_paint_cmd_fill_ensures_0 rect color result := trivial
def vc_paint_cmd_fill_decreases_0 (rect : Int) (color : Int) : Nat := 0
theorem vc_paint_cmd_fill_decreases_0_proved (rect : Int) (color : Int) : vc_paint_cmd_fill_decreases_0 rect color = 0 := rfl
def vc_paint_cmd_fill_call0_paint_op_fill_rect_requires_0 (rect : Int) (color : Int) : Prop := True
theorem vc_paint_cmd_fill_call0_paint_op_fill_rect_requires_0_proved (rect : Int) (color : Int) : vc_paint_cmd_fill_call0_paint_op_fill_rect_requires_0 rect color := trivial

end paint_cmd_fill

namespace paint_cmd_stroke

/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_cmd_stroke_requires_0 (rect : Int) (color : Int) (stroke_px : Float) : Prop := True
theorem vc_paint_cmd_stroke_requires_0_proved (rect : Int) (color : Int) (stroke_px : Float) : vc_paint_cmd_stroke_requires_0 rect color stroke_px := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_cmd_stroke_requires_1 (rect : Int) (color : Int) (stroke_px : Float) : Prop := True
theorem vc_paint_cmd_stroke_requires_1_proved (rect : Int) (color : Int) (stroke_px : Float) : vc_paint_cmd_stroke_requires_1 rect color stroke_px := trivial
def vc_paint_cmd_stroke_requires_2 (rect : Int) (color : Int) (stroke_px : Float) : Prop := (stroke_px ≥ (0 : Float))
/-! VC ensures (opaque): source expr not yet translated -/
def vc_paint_cmd_stroke_ensures_0 (rect : Int) (color : Int) (stroke_px : Float) (result : Int) : Prop := True
theorem vc_paint_cmd_stroke_ensures_0_proved (rect : Int) (color : Int) (stroke_px : Float) (result : Int) : vc_paint_cmd_stroke_ensures_0 rect color stroke_px result := trivial
def vc_paint_cmd_stroke_decreases_0 (rect : Int) (color : Int) (stroke_px : Float) : Nat := 0
theorem vc_paint_cmd_stroke_decreases_0_proved (rect : Int) (color : Int) (stroke_px : Float) : vc_paint_cmd_stroke_decreases_0 rect color stroke_px = 0 := rfl
def vc_paint_cmd_stroke_call0_paint_op_stroke_rect_requires_0 (rect : Int) (color : Int) (stroke_px : Float) : Prop := True
theorem vc_paint_cmd_stroke_call0_paint_op_stroke_rect_requires_0_proved (rect : Int) (color : Int) (stroke_px : Float) : vc_paint_cmd_stroke_call0_paint_op_stroke_rect_requires_0 rect color stroke_px := trivial

end paint_cmd_stroke

namespace paint_cmd_viewport_grid

/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_cmd_viewport_grid_requires_0 (rect : Int) : Prop := True
theorem vc_paint_cmd_viewport_grid_requires_0_proved (rect : Int) : vc_paint_cmd_viewport_grid_requires_0 rect := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_cmd_viewport_grid_requires_1 (rect : Int) : Prop := True
theorem vc_paint_cmd_viewport_grid_requires_1_proved (rect : Int) : vc_paint_cmd_viewport_grid_requires_1 rect := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_paint_cmd_viewport_grid_ensures_0 (rect : Int) (result : Int) : Prop := True
theorem vc_paint_cmd_viewport_grid_ensures_0_proved (rect : Int) (result : Int) : vc_paint_cmd_viewport_grid_ensures_0 rect result := trivial
def vc_paint_cmd_viewport_grid_decreases_0 (rect : Int) : Nat := 0
theorem vc_paint_cmd_viewport_grid_decreases_0_proved (rect : Int) : vc_paint_cmd_viewport_grid_decreases_0 rect = 0 := rfl
def vc_paint_cmd_viewport_grid_call0_paint_op_viewport_grid_requires_0 (rect : Int) : Prop := True
theorem vc_paint_cmd_viewport_grid_call0_paint_op_viewport_grid_requires_0_proved (rect : Int) : vc_paint_cmd_viewport_grid_call0_paint_op_viewport_grid_requires_0 rect := trivial
def vc_paint_cmd_viewport_grid_call1_studio_color_accent_cyan_requires_0 (rect : Int) : Prop := True
theorem vc_paint_cmd_viewport_grid_call1_studio_color_accent_cyan_requires_0_proved (rect : Int) : vc_paint_cmd_viewport_grid_call1_studio_color_accent_cyan_requires_0 rect := trivial

end paint_cmd_viewport_grid

namespace paint_studio_shell_chrome

/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_studio_shell_chrome_requires_0 (frame : Int) (layout : Int) : Prop := True
theorem vc_paint_studio_shell_chrome_requires_0_proved (frame : Int) (layout : Int) : vc_paint_studio_shell_chrome_requires_0 frame layout := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_paint_studio_shell_chrome_ensures_0 (frame : Int) (layout : Int) (result : Unit) : Prop := True
theorem vc_paint_studio_shell_chrome_ensures_0_proved (frame : Int) (layout : Int) (result : Unit) : vc_paint_studio_shell_chrome_ensures_0 frame layout result := trivial
def vc_paint_studio_shell_chrome_decreases_0 (frame : Int) (layout : Int) : Nat := 0
theorem vc_paint_studio_shell_chrome_decreases_0_proved (frame : Int) (layout : Int) : vc_paint_studio_shell_chrome_decreases_0 frame layout = 0 := rfl
def vc_paint_studio_shell_chrome_call0_paint_studio_shell_chrome_count_requires_0 (frame : Int) (layout : Int) : Prop := True
theorem vc_paint_studio_shell_chrome_call0_paint_studio_shell_chrome_count_requires_0_proved (frame : Int) (layout : Int) : vc_paint_studio_shell_chrome_call0_paint_studio_shell_chrome_count_requires_0 frame layout := trivial
def vc_paint_studio_shell_chrome_call1_paint_op_viewport_grid_requires_0 (frame : Int) (layout : Int) : Prop := True
theorem vc_paint_studio_shell_chrome_call1_paint_op_viewport_grid_requires_0_proved (frame : Int) (layout : Int) : vc_paint_studio_shell_chrome_call1_paint_op_viewport_grid_requires_0 frame layout := trivial
def vc_paint_studio_shell_chrome_call2_studio_color_accent_cyan_requires_0 (frame : Int) (layout : Int) : Prop := True
theorem vc_paint_studio_shell_chrome_call2_studio_color_accent_cyan_requires_0_proved (frame : Int) (layout : Int) : vc_paint_studio_shell_chrome_call2_studio_color_accent_cyan_requires_0 frame layout := trivial

end paint_studio_shell_chrome

namespace paint_studio_shell_chrome_count

def vc_paint_studio_shell_chrome_count_requires_0 : Prop := True
theorem vc_paint_studio_shell_chrome_count_requires_0_proved : vc_paint_studio_shell_chrome_count_requires_0 := trivial
def vc_paint_studio_shell_chrome_count_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_paint_studio_shell_chrome_count_ensures_0_proved (result : Int) : vc_paint_studio_shell_chrome_count_ensures_0 result := trivial
def vc_paint_studio_shell_chrome_count_decreases_0 : Nat := 0
theorem vc_paint_studio_shell_chrome_count_decreases_0_proved : vc_paint_studio_shell_chrome_count_decreases_0 = 0 := rfl

end paint_studio_shell_chrome_count

namespace paint_studio_shell_chrome_with_palette_count

/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_studio_shell_chrome_with_palette_count_requires_0 (palette_open : Int) : Prop := True
theorem vc_paint_studio_shell_chrome_with_palette_count_requires_0_proved (palette_open : Int) : vc_paint_studio_shell_chrome_with_palette_count_requires_0 palette_open := trivial
/-! VC requires (opaque): source expr not yet translated -/
def vc_paint_studio_shell_chrome_with_palette_count_requires_1 (palette_open : Int) : Prop := True
theorem vc_paint_studio_shell_chrome_with_palette_count_requires_1_proved (palette_open : Int) : vc_paint_studio_shell_chrome_with_palette_count_requires_1 palette_open := trivial
/-! VC ensures (opaque): source expr not yet translated -/
def vc_paint_studio_shell_chrome_with_palette_count_ensures_0 (palette_open : Int) (result : Int) : Prop := True
theorem vc_paint_studio_shell_chrome_with_palette_count_ensures_0_proved (palette_open : Int) (result : Int) : vc_paint_studio_shell_chrome_with_palette_count_ensures_0 palette_open result := trivial
def vc_paint_studio_shell_chrome_with_palette_count_decreases_0 (palette_open : Int) : Nat := Int.toNat palette_open
theorem vc_paint_studio_shell_chrome_with_palette_count_decreases_0_proved (palette_open : Int) : vc_paint_studio_shell_chrome_with_palette_count_decreases_0 palette_open = Int.toNat palette_open := rfl
def vc_paint_studio_shell_chrome_with_palette_count_call0_paint_studio_shell_chrome_count_requires_0 (palette_open : Int) : Prop := True
theorem vc_paint_studio_shell_chrome_with_palette_count_call0_paint_studio_shell_chrome_count_requires_0_proved (palette_open : Int) : vc_paint_studio_shell_chrome_with_palette_count_call0_paint_studio_shell_chrome_count_requires_0 palette_open := trivial
/-! VC call-site requires (opaque): callee 'paint_studio_palette_count' at call 1 -/
def vc_paint_studio_shell_chrome_with_palette_count_call1_paint_studio_palette_count_requires_0 (palette_open : Int) : Prop := True
/-! VC call-site requires (opaque): callee 'paint_studio_palette_count' at call 1 -/
def vc_paint_studio_shell_chrome_with_palette_count_call1_paint_studio_palette_count_requires_1 (palette_open : Int) : Prop := True

end paint_studio_shell_chrome_with_palette_count

end AutoVC
