#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SideraTextDeltaDecision {
    Emit,
    Suppress,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SideraAssistantStreamMode {
    Direct,
    ToolHidden,
    Final,
}

#[derive(Debug)]
pub struct SideraAssistantStreamGate {
    mode: SideraAssistantStreamMode,
    visible_text: bool,
}

impl Default for SideraAssistantStreamGate {
    fn default() -> Self {
        Self {
            mode: SideraAssistantStreamMode::Direct,
            visible_text: false,
        }
    }
}

impl SideraAssistantStreamGate {
    pub fn on_text_delta(&mut self) -> SideraTextDeltaDecision {
        if self.mode == SideraAssistantStreamMode::ToolHidden {
            SideraTextDeltaDecision::Suppress
        } else {
            self.visible_text = true;
            SideraTextDeltaDecision::Emit
        }
    }

    pub fn begin_tool(&mut self) -> bool {
        let replace_visible_text = self.visible_text;
        self.mode = SideraAssistantStreamMode::ToolHidden;
        self.visible_text = false;
        replace_visible_text
    }

    pub fn release_final(&mut self) {
        self.mode = SideraAssistantStreamMode::Final;
    }

    #[cfg(test)]
    fn mode(&self) -> SideraAssistantStreamMode {
        self.mode
    }
}

#[cfg(test)]
mod tests {
    use super::{
        SideraAssistantStreamGate, SideraAssistantStreamMode, SideraTextDeltaDecision,
    };

    #[test]
    fn direct_text_streams_from_the_first_delta() {
        let mut gate = SideraAssistantStreamGate::default();
        assert_eq!(gate.on_text_delta(), SideraTextDeltaDecision::Emit);
        assert_eq!(gate.on_text_delta(), SideraTextDeltaDecision::Emit);
        assert_eq!(gate.mode(), SideraAssistantStreamMode::Direct);
    }

    #[test]
    fn text_then_tool_retracts_once_and_hides_process_prose() {
        let mut gate = SideraAssistantStreamGate::default();
        assert_eq!(gate.on_text_delta(), SideraTextDeltaDecision::Emit);
        assert!(gate.begin_tool());
        assert!(!gate.begin_tool());
        assert_eq!(gate.on_text_delta(), SideraTextDeltaDecision::Suppress);
        assert_eq!(gate.mode(), SideraAssistantStreamMode::ToolHidden);
    }

    #[test]
    fn tool_first_hides_prose_until_final_release() {
        let mut gate = SideraAssistantStreamGate::default();
        assert!(!gate.begin_tool());
        assert_eq!(gate.on_text_delta(), SideraTextDeltaDecision::Suppress);
        gate.release_final();
        assert_eq!(gate.on_text_delta(), SideraTextDeltaDecision::Emit);
        assert_eq!(gate.mode(), SideraAssistantStreamMode::Final);
    }

    #[test]
    fn a_later_tool_retracts_provisional_final_text() {
        let mut gate = SideraAssistantStreamGate::default();
        gate.begin_tool();
        gate.release_final();
        assert_eq!(gate.on_text_delta(), SideraTextDeltaDecision::Emit);
        assert!(gate.begin_tool());
        assert_eq!(gate.on_text_delta(), SideraTextDeltaDecision::Suppress);
    }
}
